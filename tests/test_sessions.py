import asyncio
import json

import pytest

from demo.sessions import EventBus, Session


def test_player_turn_blocks_until_matching_reply(tmp_path):
    async def check():
        session = Session({}, tmp_path)
        task = asyncio.create_task(session.ask("landlord", "Approve £320?", ["Decline"]))
        await asyncio.sleep(0)
        assert not task.done()
        prompt = session.pending["prompt_id"]
        with pytest.raises(ValueError, match="different"):
            session.answer("tenant", "Approve", prompt)
        with pytest.raises(ValueError, match="different"):
            session.answer("landlord", "Approve", "stale")
        session.answer("landlord", "Decline", prompt)
        with pytest.raises(ValueError, match="No player"):
            session.answer("landlord", "Approve", prompt)
        assert await task == "Decline"
        assert session.pending is None
        recorded = [json.loads(line) for line in session.path.read_text().splitlines()]
        assert recorded[0]["t"] == "awaiting_player"
    asyncio.run(check())


def test_timeout_cleans_up_pending_turn(tmp_path):
    async def check():
        session = Session({}, tmp_path)
        with pytest.raises(TimeoutError):
            await session.ask("tenant", "Access?", timeout=.001)
        assert session.pending is None
        assert session.reply is None
    asyncio.run(check())


def test_sessions_are_isolated_and_log_before_broadcast(tmp_path):
    observed = []
    first = Session({}, tmp_path, lambda e: observed.append(json.loads(first.path.read_text().splitlines()[-1])))
    second = Session({}, tmp_path)
    first.emit({"t": "actor_message", "body": "<script>alert(1)</script>"})
    assert first.id != second.id
    assert second.events == []
    assert observed == first.events
    first.finish("complete")
    first.finish("complete again")
    assert len(first.events) == 2


def test_event_bus_resumes_without_duplicates():
    async def check():
        bus = EventBus(limit=3)
        for n in range(5):
            bus.publish({"seq": n})
        assert [e["cursor"] for e in bus.since(3)] == [4, 5]
        waiter = asyncio.create_task(bus.wait(5))
        await asyncio.sleep(0)
        assert not waiter.done()
        bus.publish({"seq": 5})
        assert [e["cursor"] for e in await waiter] == [6]
    asyncio.run(check())
