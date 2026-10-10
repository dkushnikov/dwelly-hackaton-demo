import json
from pathlib import Path

import pytest

from demo.protocol import effect_event, owner_of, status_event, summary_of, trace_event


@pytest.mark.parametrize("state,owner", [
    ({"hold_reason": "Waiting for Landlord: quote", "disposition": "escalated"}, "landlord"),
    ({"hold_reason": "Waiting for Provider"}, "contractor"),
    ({"hold_reason": "Waiting for Tenant"}, "tenant"),
    ({"disposition": "escalated"}, "operator"),
    ({"next_step": "Contractor to arrange access with tenant"}, "contractor"),
    ({"next_step": "Property manager to verify contractor"}, "operator"),
    ({"next_step": "Check whether landlord replied"}, "agency"),
])
def test_owner_priority(state, owner):
    assert owner_of(state) == owner


def test_old_status_does_not_invent_stage_or_checklist():
    event = status_event({"decision": "Contractor dispatched", "disposition": "resolved"})
    assert event["stage"] == "unknown"
    assert event["dod"] == []
    assert event["recap"] == "Contractor dispatched"


def test_trace_result_is_not_promoted_to_effect():
    event = trace_event({"event": "tool_result", "tool": "create_work_order", "status": "unconfirmed"})
    assert event["t"] == "tool_result"
    assert event["status"] == "unconfirmed"


def test_gate_retains_exact_rules_and_reason():
    event = trace_event({"event": "gate", "tool": "update_payment_details", "verdict": "deny", "rules": ["PRO-PAYMENT-DETAILS"], "reason": "Not permitted"})
    assert event["verdict"] == "deny"
    assert event["rules"] == ["PRO-PAYMENT-DETAILS"]


def test_approval_effect_is_addressed_to_landlord():
    event = effect_event("request_landlord_approval", {"property_id": "P-002", "subject": "Approve £320?"})
    assert event["to_role"] == "landlord"
    assert event["property"] == "P-002"


def test_idempotent_confirmation_is_not_a_second_dispatch():
    event = effect_event("create_work_order", {"idempotency_key": "same-write"}, {"id": "WO-1", "deduplicated": True})
    assert event["deduplicated"] is True


def test_summary_does_not_count_read_gates_or_refusals_as_blocks():
    result = summary_of([
        {"t": "gate", "verdict": "allow", "reason": "read"},
        {"t": "gate", "verdict": "allow", "reason": "Within mandate"},
        {"t": "status", "withheld_actions": ["no payment"], "dod": []},
    ])
    assert result["allowed"] == 1
    assert result["blocked"] == 0
    assert result["withheld"] == 1


def test_bundled_replays_have_provenance_and_contiguous_sequences():
    root = Path(__file__).resolve().parents[1] / "demo/web/replays"
    for path in root.glob("*.jsonl"):
        events = [json.loads(line) for line in path.read_text().splitlines()]
        assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
        assert events[0]["provenance"]["kind"] == "recorded_agent_run"
        assert len(events[0]["provenance"]["state_sha256"]) == 64
        assert events[-1]["t"] == "episode_end"
        assert path.stat().st_size < 300_000


def test_fraud_replay_truthfully_records_refusal_without_fabricated_deny():
    path = Path(__file__).resolve().parents[1] / "demo/web/replays/fraud.jsonl"
    events = [json.loads(line) for line in path.read_text().splitlines()]
    assert any(e["t"] == "withheld" for e in events)
    assert not any(e["t"] == "gate" and e.get("verdict") == "deny" for e in events)
    assert not any(e["t"] == "effect" and e.get("op") == "update_payment_details" for e in events)
