import asyncio
import json

import pytest

from demo.server import Application
from demo.sessions import Session


async def request(app, path, method="GET", data=None, headers=None):
    output = []
    async def send(message):
        output.append(message)
    async def receive():
        return {"type": "http.request", "body": json.dumps(data or {}).encode()}
    scope = {"type": "http", "path": path, "method": method, "scheme": "http", "query_string": b"", "headers": headers or [(b"host", b"localhost"), (b"content-type", b"application/json")]}
    await app(scope, receive, send)
    return output[0]["status"], b"".join(part.get("body", b"") for part in output[1:]), dict(output[0]["headers"])


def test_replay_server_runs_without_live_engine(tmp_path):
    async def check():
        app = Application(runs=tmp_path)
        status, body, _ = await request(app, "/api/health")
        assert status == 200 and json.loads(body)["live"] is False
        status, _, _ = await request(app, "/api/sessions", "POST")
        assert status == 503
        status, body, headers = await request(app, "/")
        assert status == 200 and b"Lettings Village" in body
        assert b"frame-ancestors 'none'" in headers[b"content-security-policy"]
    asyncio.run(check())


@pytest.mark.parametrize("path", ["/../pyproject.toml", "/%2e%2e/pyproject.toml", "/.env", "/api/no-such-route"])
def test_static_paths_cannot_escape_web_root(path, tmp_path):
    assert asyncio.run(request(Application(runs=tmp_path), path))[0] == 404


def test_cross_origin_write_is_rejected(tmp_path):
    headers = [(b"host", b"localhost"), (b"origin", b"https://attacker.invalid"), (b"content-type", b"application/json")]
    assert asyncio.run(request(Application(runs=tmp_path), "/api/sessions", "POST", headers=headers))[0] == 403


def test_dns_rebinding_host_is_rejected(tmp_path):
    headers = [(b"host", b"attacker.invalid"), (b"origin", b"http://attacker.invalid"), (b"content-type", b"application/json")]
    assert asyncio.run(request(Application(runs=tmp_path), "/api/health", headers=headers))[0] == 403


def test_configured_cloudflare_origin_is_accepted(tmp_path):
    headers = [(b"host", b"village.example.com")]
    app = Application(runs=tmp_path, public_origin="https://village.example.com")
    assert asyncio.run(request(app, "/api/health", headers=headers))[0] == 200


@pytest.mark.parametrize("cfg", [{"max_ticks": True}, {"max_ticks": 99}, {"role": "root"}, {"scenario": "free", "issue": ""}, {"property": "P-404"}, {"director": "bad"}])
def test_invalid_session_configuration_is_rejected(cfg):
    with pytest.raises(ValueError):
        Application().validate(cfg)


def test_recordings_survive_server_restart(tmp_path):
    session = Session({}, tmp_path)
    session.emit({"t": "ticket_opened"})
    session.finish("stopped")
    fresh = Application(runs=tmp_path)
    status, body, _ = asyncio.run(request(fresh, f"/api/sessions/{session.id}/recording"))
    assert status == 200
    assert len(body.decode().splitlines()) == 2


def test_sse_reconnect_uses_cursor_and_cleans_up(tmp_path):
    async def check():
        app = Application(runs=tmp_path)
        app.bus.publish({"v": 1, "seq": 1})
        app.bus.publish({"v": 1, "seq": 2})
        output, incoming = [], asyncio.Queue()
        async def send(message):
            output.append(message)
            if message.get("body", b"").startswith(b"id:"):
                await incoming.put({"type": "http.disconnect"})
        await asyncio.wait_for(app.stream(1, incoming.get, send), 1)
        text = b"".join(m.get("body", b"") for m in output)
        assert b"id: 2" in text
        assert b"id: 1" not in text
    asyncio.run(check())
