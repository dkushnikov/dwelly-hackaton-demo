import asyncio
from unittest.mock import patch

import pytest

from demo.cloud import BoundedEngine, CloudApplication, persist_event
from demo.sessions import Session


def test_remote_journal_commits_before_local_publication(tmp_path):
    received, published = [], []
    session = Session({}, tmp_path, published.append, journal=received.append)
    event = session.emit({"t": "ticket_opened"})
    assert received == published == [event]
    assert session.path.read_text().strip()


def test_failed_remote_journal_cannot_publish_or_finish(tmp_path):
    def unavailable(event):
        raise RuntimeError("journal unavailable")
    published = []
    session = Session({}, tmp_path, published.append, journal=unavailable)
    with pytest.raises(RuntimeError, match="journal unavailable"):
        session.finish("complete")
    assert not session.finished and not session.events and not published
    assert not session.path.exists()


def test_cloud_bounds_rounds_and_uses_scripted_personas():
    config = CloudApplication().validate({"max_ticks": 8, "director": "improvise"})
    assert config["max_ticks"] == 4 and config["director"] == "scripted"


def test_remote_journal_retries_same_event_without_exposing_credentials():
    with patch("demo.cloud.urllib.request.urlopen", side_effect=OSError("private diagnostic")) as send:
        with pytest.raises(RuntimeError, match="Persistent journal unavailable"):
            persist_event({"session": "test", "seq": 1})
        assert send.call_count == 2
        assert send.call_args_list[0].args[0].data == send.call_args_list[1].args[0].data
        assert send.call_args.args[0].full_url == "http://village-internal/journal"


def test_cloud_deadline_finishes_a_timed_out_session(tmp_path):
    class Engine:
        async def run(self, session):
            raise TimeoutError
    session = Session({}, tmp_path)
    asyncio.run(BoundedEngine(Engine()).run(session))
    assert session.finished and session.events[-1]["t"] == "episode_end"
    assert "15-minute" in session.events[-1]["reason"]
