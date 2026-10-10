"""Small ASGI application: same-origin API, multiplexed SSE, static offline client."""

import argparse
import asyncio
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from .scenarios import SCENARIOS
from .sessions import EventBus, Session

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
ID = re.compile(r"^[a-f0-9]{32}$")


class Application:
    def __init__(self, engine=None, runs=None, public_origin=None, max_sessions=32):
        self.engine = engine
        self.runs = Path(runs or ROOT.parent / "runs/demo")
        self.public_origin = public_origin
        self.max_sessions = max_sessions
        self.sessions = {}
        self.bus = EventBus()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            while True:
                event = await receive()
                if event["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif event["type"] == "lifespan.shutdown":
                    tasks = [s.task for s in self.sessions.values() if s.task and not s.task.done()]
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
                    if self.engine:
                        await self.engine.close()
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            return
        try:
            await self.route(scope, receive, send)
        except (ValueError, KeyError, TypeError) as exc:
            await self.json(send, 400, {"error": str(exc)})

    async def respond(self, send, code, body, content_type="application/json; charset=utf-8", extra=()):
        headers = [(b"content-type", content_type.encode()), (b"content-length", str(len(body)).encode()),
                   (b"x-content-type-options", b"nosniff"), (b"cache-control", b"no-store"),
                   (b"referrer-policy", b"same-origin"),
                   (b"content-security-policy", b"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'")]
        await send({"type": "http.response.start", "status": code, "headers": headers + list(extra)})
        await send({"type": "http.response.body", "body": body})

    async def json(self, send, code, obj):
        await self.respond(send, code, json.dumps(obj, ensure_ascii=False).encode())

    async def body(self, receive):
        data = b""
        while True:
            part = await receive()
            if part["type"] == "http.disconnect":
                raise ValueError("Request disconnected")
            data += part.get("body", b"")
            if len(data) > 8192:
                raise ValueError("Request is too large")
            if not part.get("more_body"):
                break
        obj = json.loads(data or b"{}")
        if not isinstance(obj, dict):
            raise ValueError("Expected a JSON object")
        return obj

    def same_origin(self, scope):
        headers = dict(scope["headers"])
        if headers.get(b"sec-fetch-site", b"") == b"cross-site":
            return False
        origin = headers.get(b"origin", b"").decode()
        expected = self.public_origin or f"{scope.get('scheme', 'http')}://{headers.get(b'host', b'').decode()}"
        # JSON-only writes + exact Origin check. CLI clients may omit Origin.
        return (not origin or origin == expected) and headers.get(b"content-type", b"").startswith(b"application/json")

    async def route(self, scope, receive, send):
        path, method = scope["path"], scope["method"]
        host = dict(scope["headers"]).get(b"host", b"").decode()
        allowed = {urlsplit(self.public_origin).netloc} if self.public_origin else {"localhost", "127.0.0.1", "::1"}
        check_host = host if self.public_origin else urlsplit("//" + host).hostname
        if check_host not in allowed:
            return await self.json(send, 403, {"error": "Unrecognised host; configure --public-origin for remote access"})
        if method == "POST" and not self.same_origin(scope):
            return await self.json(send, 403, {"error": "Use same-origin JSON requests"})
        if method == "GET" and path == "/api/health":
            return await self.json(send, 200, {"ok": True, "live": bool(self.engine), "protocol": 1,
                "message": "Real agent connected" if self.engine else "Simulation and replay · no API calls", "max_sessions": self.max_sessions})
        if method == "GET" and path == "/api/sessions":
            return await self.json(send, 200, {"cursor": self.bus.cursor, "sessions": [s.snapshot() for s in self.sessions.values()]})
        if method == "POST" and path == "/api/reset":
            if (await self.body(receive)).get("confirm") is not True:
                return await self.json(send, 400, {"error": "Confirm stopping and clearing the live sessions"})
            sessions = list(self.sessions.values())
            tasks = [s.task for s in sessions if s.task and not s.task.done()]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            for session in sessions:
                session.finish("Session stopped by demo reset; journal preserved")
                self.sessions.pop(session.id, None)
            ids = [s.id for s in sessions]
            self.bus.publish({"v": 1, "t": "workspace_reset", "session_ids": ids})
            return await self.json(send, 200, {"ok": True, "cleared": ids, "journals_preserved": True})
        if method == "GET" and path == "/api/events":
            query = parse_qs(scope.get("query_string", b"").decode())
            headers = dict(scope["headers"])
            cursor = int(headers.get(b"last-event-id", query.get("after", ["0"])[0]))
            if cursor < 0:
                raise ValueError("Invalid event cursor")
            return await self.stream(cursor, receive, send)
        if method == "POST" and path == "/api/sessions":
            if not self.engine:
                return await self.json(send, 503, {"error": "Live agent is not configured. Recorded runs work offline."})
            if len(self.sessions) >= self.max_sessions:
                # Evict only completed sessions; their JSONL remains downloadable.
                completed = next((k for k, s in self.sessions.items() if s.finished), None)
                if completed:
                    del self.sessions[completed]
                else:
                    return await self.json(send, 429, {"error": "All session slots are busy. Stop a ticket first."})
            config = self.validate(await self.body(receive))
            session = Session(config, self.runs, self.bus.publish)
            self.sessions[session.id] = session
            session.task = asyncio.create_task(self.engine.run(session))
            return await self.json(send, 201, {"id": session.id})
        match = re.fullmatch(r"/api/sessions/([a-f0-9]{32})/(message|cancel|recording)", path)
        if match:
            sid, action = match.groups()
            if method == "GET" and action == "recording":
                file = self.runs / f"{sid}.jsonl"
                if not file.is_file():
                    return await self.json(send, 404, {"error": "Recording not found"})
                return await self.respond(send, 200, file.read_bytes(), "application/x-ndjson",
                    [(b"content-disposition", f'attachment; filename="{sid}.jsonl"'.encode())])
            session = self.sessions.get(sid)
            if session is None:
                return await self.json(send, 404, {"error": "Session not found; after a restart use its recording"})
            if method == "POST" and action == "message":
                body = await self.body(receive)
                session.answer(body.get("role"), body.get("body"), body.get("prompt_id"))
                return await self.json(send, 200, {"ok": True})
            if method == "POST" and action == "cancel":
                session.task.cancel()
                await asyncio.gather(session.task, return_exceptions=True)
                session.finish("Session stopped by presenter")
                return await self.json(send, 200, {"ok": True})
        if method == "GET" and not path.startswith("/api/"):
            return await self.static(path, send)
        await self.json(send, 404, {"error": "Not found"})

    def validate(self, cfg):
        scenario = cfg.get("scenario", "routine")
        if scenario not in [s["id"] for s in SCENARIOS] + ["free"]:
            raise ValueError("Unknown scenario")
        role = cfg.get("role", "watch")
        if role not in ("watch", "tenant", "landlord", "contractor", "operator"):
            raise ValueError("Unknown role")
        prop = cfg.get("property", "P-001")
        if prop not in [f"P-{n:03}" for n in range(1, 7)]:
            raise ValueError("Unknown property")
        issue = cfg.get("issue", "")
        if not isinstance(issue, str) or len(issue) > 4000 or (scenario == "free" and not issue.strip()):
            raise ValueError("Issue must contain 1–4000 characters")
        ticks = cfg.get("max_ticks", 4)
        if type(ticks) is not int or not 1 <= ticks <= 8:
            raise ValueError("max_ticks must be an integer between 1 and 8")
        director = cfg.get("director", "scripted")
        if director not in ("scripted", "improvise"):
            raise ValueError("Unknown director")
        controls = cfg.get("controls")
        if controls is None:
            controls = {r: "human" if r in (role, "operator") else "ai" for r in ("tenant", "landlord", "contractor", "operator")}
        if not isinstance(controls, dict) or set(controls) != {"tenant", "landlord", "contractor", "operator"} or any(v not in ("ai", "human") for v in controls.values()):
            raise ValueError("Set each participant to ai or human")
        return dict(scenario=scenario, role=role, property=prop, issue=issue.strip(), max_ticks=ticks, director=director, controls=controls)

    async def stream(self, cursor, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": [
            (b"content-type", b"text/event-stream"), (b"cache-control", b"no-cache, no-transform"),
            (b"x-accel-buffering", b"no"), (b"x-content-type-options", b"nosniff")]})
        disconnected = asyncio.create_task(self.disconnected(receive))
        batch_task = None
        try:
            while not disconnected.done():
                if self.bus.events and cursor < self.bus.events[0]["cursor"] - 1:
                    await send({"type": "http.response.body", "body": b"event: reset\ndata: {}\n\n", "more_body": False})
                    return
                batch_task = asyncio.create_task(self.bus.wait(cursor))
                done, _ = await asyncio.wait([batch_task, disconnected], return_when=asyncio.FIRST_COMPLETED)
                if disconnected in done:
                    return
                batch = batch_task.result()
                body = b": heartbeat\n\n"
                if batch:
                    body = "".join(f"id: {e['cursor']}\ndata: {json.dumps(e, ensure_ascii=False)}\n\n" for e in batch).encode()
                    cursor = batch[-1]["cursor"]
                await send({"type": "http.response.body", "body": body, "more_body": True})
        finally:
            pending = [disconnected] + ([batch_task] if batch_task else [])
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    async def disconnected(self, receive):
        while (await receive())["type"] != "http.disconnect":
            pass

    async def static(self, path, send):
        relative = unquote(path).lstrip("/") or "index.html"
        file = (WEB / relative).resolve()
        if not file.is_relative_to(WEB.resolve()) or not file.is_file() or any(p.startswith(".") for p in Path(relative).parts):
            return await self.json(send, 404, {"error": "File not found"})
        content_type = "application/x-ndjson" if file.suffix == ".jsonl" else mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        await self.respond(send, 200, file.read_bytes(), content_type)


def main():
    parser = argparse.ArgumentParser(description="Lettings Village")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--agent-root", type=Path)
    parser.add_argument("--replay", action="store_true")
    parser.add_argument("--public-origin", help="Exact HTTPS origin when behind Cloudflare")
    parser.add_argument("--runs", type=Path, default=ROOT.parent / "runs/demo")
    parser.add_argument("--concurrency", type=int, default=2)
    args = parser.parse_args()
    if args.public_origin and urlsplit(args.public_origin).scheme not in ("http", "https"):
        parser.error("public-origin must be an HTTP(S) origin")
    engine = None
    if args.agent_root and not args.replay:
        from .engine import AgentEngine
        try:
            engine = AgentEngine(args.agent_root, max(1, min(args.concurrency, 4)))
        except Exception as exc:
            parser.error(f"Agent configuration failed ({type(exc).__name__}). Supply the agent dependencies and runtime credentials, or use --replay.")
    import uvicorn
    print(f"Lettings Village → http://{args.host}:{args.port} · {'live agent' if engine else 'simulation + recorded runs / no API calls'}", flush=True)
    uvicorn.run(Application(engine, args.runs, args.public_origin), host=args.host, port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
