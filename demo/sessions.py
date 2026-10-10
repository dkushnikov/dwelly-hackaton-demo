"""Session journal and human-turn barrier; one independent world per ticket."""

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .protocol import summary_of


class Session:
    def __init__(self, config, directory: Path, publish=lambda e: None, journal=None):
        self.id = uuid.uuid4().hex
        self.config = config
        self.events = []
        self.publish = publish
        self.journal = journal
        self.created = time.monotonic()
        self.sim_time = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        self.tick = 0
        self.pending = None
        self.reply = None
        self.task = None
        self.finished = False
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / f"{self.id}.jsonl"

    def emit(self, event):
        event = {**event, "v": 1, "session": self.id, "seq": len(self.events) + 1,
                 "tick": self.tick, "sim_time": self.sim_time, "at_ms": round((time.monotonic() - self.created) * 1000)}
        # Journal first: a visible event always has a durable line behind it.
        if self.journal:
            self.journal(event)
        with self.path.open("a", encoding="utf-8") as log:
            log.write(json.dumps(event, ensure_ascii=False) + "\n")
        self.events.append(event)
        self.publish(event)
        return event

    async def ask(self, role, prompt, suggested=(), timeout=900):
        if self.pending:
            raise RuntimeError("A player turn is already pending")
        self.reply = asyncio.get_running_loop().create_future()
        self.pending = {"role": role, "prompt_id": uuid.uuid4().hex, "prompt": prompt, "suggested": list(suggested)}
        self.emit({"t": "awaiting_player", **self.pending})
        try:
            return await asyncio.wait_for(self.reply, timeout)
        finally:
            self.pending = None
            self.reply = None

    def answer(self, role, body, prompt_id):
        if not self.pending or not self.reply or self.reply.done():
            raise ValueError("No player turn is waiting")
        if self.pending["role"] != role or self.pending["prompt_id"] != prompt_id:
            raise ValueError("This answer belongs to a different player turn")
        if not isinstance(body, str) or not body.strip() or len(body) > 4000:
            raise ValueError("Reply must contain 1–4000 characters")
        self.reply.set_result(body.strip())

    def finish(self, reason):
        if not self.finished:
            self.emit({"t": "episode_end", "reason": reason, "summary": summary_of(self.events), "verdict": None})
            self.finished = True

    def snapshot(self):
        return {"id": self.id, "config": self.config, "events": self.events, "pending": self.pending, "finished": self.finished}


class EventBus:
    def __init__(self, limit=20000):
        self.events = []
        self.cursor = 0
        self.limit = limit
        self.changed = asyncio.Event()

    def publish(self, event):
        self.cursor += 1
        self.events.append({**event, "cursor": self.cursor})
        self.events = self.events[-self.limit:]
        self.changed.set()

    def since(self, cursor):
        return [e for e in self.events if e["cursor"] > cursor]

    async def wait(self, cursor):
        self.changed.clear()
        batch = self.since(cursor)
        if batch:
            return batch
        try:
            await asyncio.wait_for(self.changed.wait(), 10)
        except TimeoutError:
            pass
        return self.since(cursor)
