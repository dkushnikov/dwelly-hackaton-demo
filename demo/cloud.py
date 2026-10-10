"""Cloudflare entrypoint: private egress, persistent receipts, bounded live runs."""

import asyncio
import json
import os
import urllib.request

from .server import Application


def persist_event(event):
    """Fail closed before publishing an event whose remote journal did not commit."""
    body = json.dumps(event, ensure_ascii=False).encode()
    request = urllib.request.Request("http://village-internal/journal", data=body, headers={"Content-Type": "application/json"})
    # Short, synchronous writes preserve Session.emit's journal-before-publication contract.
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                if response.status != 200:
                    raise OSError("Persistent journal rejected the event")
                return
        except OSError:
            if attempt:
                raise RuntimeError("Persistent journal unavailable; live execution stopped") from None


class BoundedEngine:
    def __init__(self, engine):
        self.engine = engine

    async def run(self, session):
        try:
            await asyncio.wait_for(self.engine.run(session), timeout=900)
        except TimeoutError:
            session.finish("Cloud demo's 15-minute session limit reached; journal preserved")

    async def close(self):
        await self.engine.close()


class CloudApplication(Application):
    def validate(self, cfg):
        result = super().validate(cfg)
        result["max_ticks"] = min(result["max_ticks"], 4)
        result["director"] = "scripted"
        return result


def main():
    import uvicorn

    from .engine import AgentEngine

    origin = os.environ["VILLAGE_PUBLIC_ORIGIN"]
    engine = AgentEngine("/agent", concurrency=1)
    app = CloudApplication(engine=BoundedEngine(engine), public_origin=origin, max_sessions=1, journal=persist_event)
    uvicorn.run(app, host="0.0.0.0", port=8787, access_log=False)


if __name__ == "__main__":
    main()
