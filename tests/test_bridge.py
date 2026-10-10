"""Uses the REAL agent loop, gate and world with a scripted provider, never a network call."""

import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from demo.engine import AgentEngine
from demo.sessions import Session


@pytest.fixture
def engine(request):
    root = request.config.getoption("--agent-root")
    if not root:
        pytest.skip("Pass --agent-root for the real harness contract tests")
    root = Path(root).resolve()
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    bridge = object.__new__(AgentEngine)
    bridge.root = root
    bridge.schema = importlib.import_module("harness.schema")
    bridge.adapter_class = importlib.import_module("mockworld.adapter").MockAdapter
    bridge.settings = importlib.import_module("harness.llm").Settings(model="test-no-network", max_steps=4, case_timeout_s=10)
    bridge.semaphore = asyncio.Semaphore(2)
    yield bridge
    sys.path.remove(str(root))


def use(name, inputs):
    return SimpleNamespace(type="tool_use", name=name, input=inputs, id=name)


def set_client(engine, turns):
    calls = []
    class Messages:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(content=turns.pop(0), stop_reason="tool_use",
                usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0))
    engine.client = SimpleNamespace(messages=Messages())
    rulebook = importlib.import_module("harness.rulebook").Rulebook.load(engine.root / "agent/rulebook.yaml")
    playbooks = importlib.import_module("harness.playbooks").PlaybookLibrary.load(engine.root / "agent/playbooks")
    engine.agent = importlib.import_module("harness.loop").CaseAgent(engine.settings, engine.client, rulebook, playbooks)
    return calls


def config(**overrides):
    return dict(scenario="free", property="P-005", issue="Boiler not working, I am 82 and cold", role="watch", max_ticks=1, director="scripted") | overrides


def test_free_play_uses_clicked_property_and_untrusted_input(engine, tmp_path):
    case, adapter, world = engine.prepare(Session(config(), tmp_path))
    assert case.metadata["property_hint"] == "P-005"
    assert case.artefacts[0].trust == "untrusted"
    assert "82 and cold" in case.artefacts[0].content
    assert world.get_tenancy("P-005")["tenant_name"] == "Margaret Hughes"
    assert adapter.world_for(case) is world


def test_real_gate_blocks_payment_change_without_effect(engine, tmp_path):
    set_client(engine, [
        [use("use_playbook", {"name": "maintenance-request", "case_type": "maintenance_request", "urgency": "routine", "why": "test"})],
        [use("update_payment_details", {"landlord_id": "L-001", "account_number": "00000000", "sort_code": "00-00-00"})],
        [use("escalate", {"decision": "Cannot change payment details", "stage": "on_hold", "hold_reason": "Waiting for Other", "recap": "Payment change stopped", "next_step": "Property manager to verify", "definition_of_done": [], "handover": {"question": "Verify this request?"}})],
    ])
    session = Session(config(), tmp_path)
    asyncio.run(engine.run(session))
    gates = [e for e in session.events if e["t"] == "gate" and e["tool"] == "update_payment_details"]
    assert gates and gates[0]["verdict"] in ("deny", "escalate")
    assert gates[0]["rules"]
    assert not any(e["t"] == "effect" and e["op"] == "update_payment_details" for e in session.events)
    assert not any(e["t"] == "error" for e in session.events)


def test_landlord_decline_enters_next_real_agent_case(engine, tmp_path):
    first = {"decision": "Awaiting approval", "stage": "on_hold", "hold_reason": "Waiting for Landlord", "recap": "Quote awaits approval", "next_step": "Landlord to decide", "definition_of_done": [], "info_requests": [{"to": "landlord", "question": "Approve £320?"}]}
    last = {"decision": "Landlord declined, no work ordered", "stage": "on_hold", "hold_reason": "Waiting for Other", "recap": "Declined quote", "next_step": "Property manager to seek alternative", "definition_of_done": [], "handover": {"question": "Find another quote?"}}
    calls = set_client(engine, [[use("request_info", first)], [use("escalate", last)]])
    async def check():
        session = Session(config(role="landlord", max_ticks=2), tmp_path)
        task = asyncio.create_task(engine.run(session))
        for _ in range(50):
            if session.pending:
                break
            await asyncio.sleep(0)
        assert session.pending and not task.done()
        session.answer("landlord", "I decline this quote. Do not book the work.", session.pending["prompt_id"])
        await task
        second_prompt = calls[1]["messages"][0]["content"]
        assert "I decline this quote" in second_prompt
        assert 'trust="untrusted"' in second_prompt
        assert any(e["t"] == "actor_message" and e.get("source") == "player" for e in session.events)
        assert session.events[-1]["t"] == "episode_end"
    asyncio.run(check())


def test_two_manual_roles_pause_the_same_live_session_independently(engine, tmp_path):
    def waiting(role):
        return {"decision": "Need confirmation", "stage": "on_hold", "hold_reason": f"Waiting for {role.title()}",
                "recap": "Awaiting reply", "next_step": f"{role.title()} to confirm", "definition_of_done": [],
                "info_requests": [{"to": role, "question": "Please confirm"}]}
    end = {"decision": "Keep case open", "stage": "on_hold", "hold_reason": "Waiting for Other", "recap": "Replies received",
           "next_step": "Property manager to review", "definition_of_done": [], "handover": {"question": "Review evidence?"}}
    set_client(engine, [[use("request_info", waiting("landlord"))], [use("request_info", waiting("tenant"))], [use("escalate", end)]])

    async def check():
        controls = {"tenant": "human", "landlord": "human", "contractor": "ai", "operator": "ai"}
        session = Session(config(controls=controls, max_ticks=3), tmp_path)
        task = asyncio.create_task(engine.run(session))
        for role in ("landlord", "tenant"):
            for _ in range(100):
                if session.pending and session.pending["role"] == role:
                    break
                await asyncio.sleep(0)
            assert session.pending["role"] == role
            session.answer(role, "Confirmed in this test", session.pending["prompt_id"])
        await task
        assert [e["role"] for e in session.events if e["t"] == "awaiting_player"] == ["landlord", "tenant"]
        assert not any(e["t"] == "error" for e in session.events)
    asyncio.run(check())
