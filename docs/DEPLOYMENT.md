# Deployment

Run all commands from the demo repository root. Local installation and the agent repository link are in the [README](../README.md).

## Choose the experience

| Deployment | What works | What it needs |
|---|---|---|
| Cloudflare Pages | Interactive simulation, AI/You roles, Homes/People, recorded runs, reset/undo and Intelligence | Cloudflare account; Python 3.12+ during the build |
| Python origin behind Cloudflare Tunnel + Access | All of the above plus real agent sessions and live event streaming | Always-on host, Docker Compose, isolated agent checkout, provider credentials, Cloudflare account and a domain |

Recommended setup: a public Pages URL for anyone to explore the game, plus a protected live URL for the presentation. Static sessions and feedback stay in each browser/origin. They are not shared accounts or multiplayer rooms. Live server sessions are shared by everyone who has access to that server.

## Public demo on Cloudflare Pages

### Automatic deployment from GitHub

Connect [this repository](https://github.com/dkushnikov/dwelly-hackaton-demo) in **Workers & Pages → Create application → Pages → Connect to Git**. Use these settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `python3 -m scripts.build` |
| Build output directory | `dist` |
| Runtime | Python 3.12+; the current Pages v3 default satisfies this |

No pip/npm install, agent checkout or model credentials are needed for this build. Pushes to `main` deploy automatically; other branches can produce previews. Both private and public GitHub repositories are supported when the integration has access. See [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build runtimes](https://developers.cloudflare.com/pages/configuration/build-image/).

The build includes `_headers` and the service worker. Publish only the generated `dist/` directory. The result works under a `pages.dev` hostname; a custom domain is optional. Serve the app at the hostname root, as its asset and API paths are root-relative.

### Manual upload alternative

For a project managed through manual uploads, build and preview first:

```sh
python3 -m scripts.build
python3 -m http.server 8788 --bind 127.0.0.1 --directory dist
```

Visit `http://127.0.0.1:8788`, then stop the preview with Ctrl+C. With Node.js 22+ and npm available, sign in and publish:

```sh
npx wrangler login
npx wrangler pages project create lettings-village --production-branch main
npx wrangler pages deploy dist --project-name lettings-village --branch main
```

Skip project creation if the project already exists. If you choose a different project name, update `name` in `wrangler.jsonc` and use it in these commands. The account owner completes Wrangler authentication; no credentials belong in this repository.

Wrangler uploads a directory. The dashboard also accepts `artifacts/lettings-village-static.zip`. Choose Git integration at project creation if you want automatic Git deployments: a Direct Upload project cannot later switch to that mode without creating another project. See [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Pages CLI commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

The static app detects the absence of `/api`. It supports simulated decisions and manual turns, but cannot call the live agent. Intelligence calculations, evidence, reviews and exports run in the browser. Team feedback sync, D1 and a Worker API are not implemented. Do not put private imported ledgers or live journals inside `demo/web` or `dist`.

## Full application with a live agent

```text
Browser → Cloudflare Access → named Cloudflare Tunnel → Python origin :8787
                                                          ├─ interface assets
                                                          ├─ /api + SSE
                                                          ├─ agent checkout (read-only)
                                                          └─ persistent runs volume
```

The current integration runs a Python agent and serves the UI and API from the same origin. It is not packaged for Workers. A separate Pages frontend pointing at a remote API would require client/origin changes; use the full Python application at the live hostname instead.

Use one origin process. Sessions and pending player turns live in memory, with journals on disk. Adding Uvicorn workers or replicas requires shared session coordination, which is not implemented. Commands use HTTP and updates use SSE with keepalives; no separate message broker is needed for this demo.

### Prepare the host

Choose an always-on Linux VM or another host with Docker Compose and outbound connectivity to GitHub, the model provider and Cloudflare. A laptop works for a supervised presentation only while it stays awake and connected. Clone the repository and follow the README live dependency setup, then:

```sh
make agent-sync
make test-agent
```

The dependency is a separate sparse checkout pinned by `agent-source.json`, mounted read-only at `/agent`. Updating the team's working tree cannot change it. Stop active live cases before intentionally updating it with `make agent-update`; test and restart afterward.

Supply these values through the host's process environment/secret manager before starting Compose:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Provider credential; passed only to the server process |
| `VILLAGE_PUBLIC_ORIGIN` | Exact external origin, such as `https://village.your-domain.example`, without a path |
| `LETTINGS_AGENT_ROOT` | Optional agent directory; defaults to `./.deps/lettings-ops-agent` |
| `LOA_MODEL` | Optional model override; otherwise the pinned agent's default |
| `LOA_EFFORT`, `LOA_MAX_STEPS`, `LOA_CASE_TIMEOUT_S` | Optional agent settings and execution limits |

The application does not load `.env` files. The live Compose override translates `VILLAGE_PUBLIC_ORIGIN` into the server's `--public-origin` argument. For a direct Python launch, pass that argument explicitly, for example `make game ARGS='--public-origin https://village.your-domain.example'`.

```sh
docker compose -f compose.yaml -f deploy/compose.live.yaml up --build -d
docker compose -f compose.yaml -f deploy/compose.live.yaml ps
curl -f -H 'Host: village.your-domain.example' http://127.0.0.1:8787/api/health
```

Replace the sample hostname with the actual one. Host/Origin checks require this exact origin; a mismatched Host can reject even a local health probe. A healthy response confirms server availability and integration setup, not provider authentication or a successful model request.

The service binds the host port to `127.0.0.1`, runs as a non-root user with a read-only application filesystem and stores journals in the named `village-runs` volume. Keep and back up this volume. A restart preserves journals for replay but does not resume live Python worlds. The image installs dependencies from `pyproject.toml`; only the server dependency is pinned exactly, so this is not a fully locked container build.

For an API-free container on localhost, the base Compose file is sufficient:

```sh
docker compose up --build -d
```

Use `http://127.0.0.1:8787`. Publishing this replay-only origin through a custom hostname also requires a Compose command override with `--public-origin` and a matching healthcheck Host; Pages is the simpler static route.

### Connect the live hostname

1. Create a **named Cloudflare Tunnel** and install `cloudflared` as a service on the origin host using the [official tunnel setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/). The account owner supplies its credentials through the host's deployment tooling.
2. Route the chosen hostname to `http://localhost:8787`. These instructions assume the connector runs on the host; a connector in another container needs the origin's private Docker network address instead.
3. Protect the entire hostname, including `/api/*`, with a Cloudflare Access policy for the intended viewers. Access to the live API includes all server sessions and the ability to spend the model budget; the app has no per-user account isolation.
4. Keep the origin port private. Preserve the public Host header, match `VILLAGE_PUBLIC_ORIGIN`, and do not cache or transform `/api/*`. The server marks SSE responses `no-cache, no-transform`.
5. Complete the external smoke checks below before sharing the live URL.

Use a named tunnel: [Quick Tunnels do not support SSE](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), which this app uses for live events.

## Release checks

- Open the Pages URL in a fresh browser. Start the village: the fixed four-case pack should appear. Complete a public scenario and a manual character turn.
- Check Homes/People, a built-in Replay, JSONL import/export, reset/undo and Intelligence. Static operation must not request model credentials.
- Open the live URL through Access. Start one bounded case, verify events arrive as work happens, answer a manual turn and refresh to verify reconnection without duplicate effects.
- Export its journal and replay it. Keep an exported recording and the independent Pages URL available for the presentation.
- Check a phone-size viewport and Full screen. For offline use, wait for the service worker's availability message after the initial online visit.

The alternative [Workers + Containers deployment](CLOUDFLARE.md) runs the entire system on Cloudflare with shared-password access and persistent SQLite journals. It needs no separate Docker host or Tunnel. Its guide records the release status and external checks. See [verification records](VERIFICATION.md) for completed local checks.
