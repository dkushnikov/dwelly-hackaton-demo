# Lettings Village

A browser demo for the Dwelly AI Hackathon: **6 homes, 21 participants, concurrent maintenance stories and an auditable view of each agent decision**.

Repositories: [Village demo](https://github.com/dkushnikov/dwelly-hackaton-demo) · [Lettings operations agent](https://github.com/dkushnikov/lettings-ops-agent) · [Public hackathon cases](https://github.com/DwellyOrg/HackatonPublicCases). The demo and agent have separate source trees and environments. Until a repository is public, cloning it requires GitHub access.

[Case-by-case interface review](docs/CASE_REVIEW.md) analyses all 50 public Property Management examples, with implementation priorities, source references and acceptance criteria (Russian).

Tenants, landlords, contractors and Dwelly operators share a pixel village. Messages appear when they are recorded; a van leaves only after a confirmed work order. Select a story to inspect its evidence, policy gate, next owner, status and human handover.

## Quick start

Requirements: Git, Python 3.12+ (available as `python3`) and a modern browser. Commands below use a macOS/Linux shell; `make` is optional for running the app. The Python install includes the pinned server dependency, `uvicorn==0.43.0`. Node.js 22+ is needed only for frontend tests/lint or the optional Wrangler deployment CLI; the application has no npm dependencies.

```sh
git clone https://github.com/dkushnikov/dwelly-hackaton-demo.git
cd dwelly-hackaton-demo
python3 -m venv .venv
.venv/bin/python -m pip install .
make game-replay
```

No agent checkout or API key is needed for this mode. Without Make, run `.venv/bin/python -m demo.server --replay`. Stop the server with **Ctrl+C**. If port 8787 is occupied, use `make game-replay ARGS='--port 8788'` and open that port instead.

Make automatically uses this project's `.venv/bin/python` when available; otherwise it uses `python3`. Override it with `PYTHON=/path/to/python` if needed. A health check is available at `http://127.0.0.1:8787/api/health`; this mode returns `"live": false`.

Open <http://127.0.0.1:8787>. **Start the village** adds a fixed pack of four simulations: PM-021, PM-017, PM-025 and fraud. It does not choose random tests or clear existing cases. **Stories** opens simulations and authentic recorded decisions; **Cases** lists current sessions; **People** introduces the participants. Each home has a case-status light and count. Click a home for details, or the landlords/contractors building for a filtered People directory. **Full screen** expands the map (Escape exits); the header's **⛶** enables the separate presenter layout. The canvas adapts its resolution to the display density.

Direct fraud replay: <http://127.0.0.1:8787/?replay=fraud&presenter=1>.

The **Intelligence** tab opens the BI dashboard at <http://127.0.0.1:8787/#intelligence>. It contains 50 public cases, a separate portfolio of 84 explicitly synthetic jobs, current agent activity, evidence-backed proposals and human feedback. Filters and the staff rate recalculate estimates; metrics drill down to cases and events. See [Money Intelligence](docs/INTELLIGENCE.md).

The static `dist/` build runs on ordinary hosting without Python. Canvas, JavaScript, CSS and fonts need no external network. A service worker caches the interface, interactive simulator, public-case evidence, BI datasets and four recordings after the first successful visit. Setuptools is used only to build the Python package and include its web assets.

## An isolated copy of the agent

The demo uses its **own Git clone** of [lettings-ops-agent](https://github.com/dkushnikov/lettings-ops-agent) at `.deps/lettings-ops-agent`. It does not depend on the agent team's working tree, its uncommitted changes, or its Python environment.

[agent-source.json](agent-source.json) records the upstream repository, update branch and exact commit. The clone is ignored by this repository; the small lock file is versioned. Runtime modules, playbooks, fixtures and public data are checked out with Git sparse checkout. Workstation credentials, hooks and agent instruction files are excluded from the working copy.

```sh
make agent-sync       # Create the isolated clone or restore the pinned commit
make agent-status     # Show the upstream, pinned commit and local commit
make agent-update     # Fetch upstream main and advance the pin explicitly
make test-agent       # Verify compatibility with the copied agent, without LLM calls
```

`agent-sync` is reproducible: it uses the pinned commit, not the latest branch tip. `agent-update` accepts only a fast-forward from that pin. Both refuse to overwrite local edits or untracked files and never reset, clean, merge or push the dependency. Live startup verifies the managed checkout against the pin; it never fetches updates automatically.

Stop live sessions before updating, run `make test-agent`, review the `agent-source.json` change and restart the server. Agent behaviour changes remain upstream; demo adapters and tests belong here. See [Agent dependency workflow](docs/AGENT_DEPENDENCY.md).

## Interactive cases and three experiences

| | Simulation | Recorded runs | Live agent |
|---|---|---|---|
| Decisions | Deterministic browser simulator | Authentic saved baseline runs | Pinned `CaseAgent.run` |
| Participants | Each role can be AI or You; assignments happen within the case | Recorded messages | Each role can be automatic or manual |
| AI meaning | Scripted personas, no model calls | Previously recorded model output | Real LLM agent; optional LLM personas |
| World | Isolated simulated case | Recorded effects | Separate `MockAdapter` per ticket |
| Persistence | This browser's local storage | Bundled/imported JSONL | Server journal; active sessions reconnect |
| Credentials | None | None | Supplied to the agent process |

**Cases** (`/#cases`) lists active, waiting, successful and other finished sessions, with search and an **Open case / Take your turn** action. **New case** works in simulation mode without an agent server. Choose the home, then set Tenant, Landlord, Contractor and Operator independently to **AI** or **You**. The case routes the operator and selects a contractor only when needed; manual control begins when that role becomes involved. A single player can control several roles. These are local roleplay controls, not multi-user accounts.

**Homes** (`/#homes`) lists all six properties with residents, landlords, case counts and shortcuts to report an issue or open a home's cases. **People** searches names, trades, addresses and IDs, with role, home and per-case AI/You filters. **Replay** first offers built-in recordings or a local Village JSONL/NDJSON export, up to 2 MB. **Reset demo** clears local sessions, optionally including BI reviews/imports/settings, with a persisted undo backup. Stopping connected live sessions is a separate explicit option; their journals remain available and execution cannot be resumed by Undo.

Manual simulation turns require an explicit decision; optional notes are recorded as text and are not interpreted by a model. Declining approval, refusing access, incomplete work or rejected final checks keep the case open. Simulation success requires all workflow evidence; elapsed time alone cannot close a case. Simulations resume after a page reload, including a pending human turn. Export preserves the journal; importing it creates playback rather than a resumable simulation.

Three complete stories are adapted from the public **Property Management** track:

- **PM-021 — Key Replacement Request:** approval → provider → access → lock repair → four-key accounting → final checks.
- **PM-017 — Kitchen Extractor Fan:** landlord advice → tenant finds the switch → closed without a visit or payment.
- **PM-025 — Oven Repair:** initially disputed warranty → manufacturer cover confirmed → parts wait → charge-free repair → final checks.

Each has original event references, pinned source links and SHA-256 hashes. Residents and properties are mapped to the village. The warranty source contains inconsistent dates; the simulation uses relative time and discloses this. The bundled public outcomes guide the simulation only; they are not passed to the live agent as future evidence. These successful simulations do **not** certify LLM performance.

The other stories support simulated repair, spending approval, vulnerable-resident care and fraud prevention. A free-form safety report ends in an unresolved emergency handover, rather than claiming a completed repair. Details and limitations: [Interactive mode](docs/INTERACTIVE.md).

The original `pixel-village-demo.md` was a description of the intended experience. This project implements its own driver around the agent's public harness contract. The initial upstream checkout did not include the simulator described in that document; newer upstream versions may include one. The village currently uses its own driver. The original Canvas renderer keeps the presentation self-contained without Phaser or a CDN.

## Run with the real agent

After the quick-start setup, install the declared live dependencies in the demo's own environment and synchronize the source copy. Node.js 22+ is required for the compatibility test command:

```sh
.venv/bin/python -m pip install '.[live,dev]'
make agent-sync
make test-agent
```

Before starting the live server, the process owner supplies `ANTHROPIC_API_KEY` through their secret manager to its environment. The application **does not load `.env` files**, accept keys from the browser or return them through the API. `LOA_MODEL`, `LOA_EFFORT`, `LOA_MAX_STEPS` and `LOA_CASE_TIMEOUT_S` retain their upstream meanings. The default model comes from the pinned agent's `Settings`.

Stop the replay server if it uses the same port, then run:

```sh
make game
```

Open `http://127.0.0.1:8787` again. Live sessions make paid provider calls; `make test-agent` uses a scripted model client and does not require a provider key. A healthy live server confirms that the integration is available, not that a paid model call has succeeded.

In **Stories → Experience → Live agent**, assign each role independently to AI or You. The session waits whenever a manual role needs to reply. The legacy API still defaults operator escalation to a human; the new form makes every assignment explicit. Automatic operator replies remain untrusted evidence and cannot grant new policy authority. Player replies become `Artefact(trust="untrusted")`; they do not grant authority.

The agent receives tool results and policy gate outcomes within a decision. Between rounds, it receives participant replies, action receipts and the previous DecisionState. There is no automatic judge, self-training or automatic rulebook modification.

For a free-form issue, use **New case**, or click a home and choose **Report an issue**. Select Simulation or, when connected, Real LLM agent. For example, select P-005 and enter `Boiler not working, I'm 82 and it's cold`. The property record comes from the copied agent's mock world. The server supports up to 32 sessions, with two simultaneous agent requests by default; `--concurrency` allows 1–4. Each ticket can use 1, 4 or 8 rounds.

Scripted personas offer availability or request clarification; they do not prescribe the agency's decisions. The AI director improvises other participants and makes additional API calls. Both paths still use the policy gate. A live run may finish while waiting for a person rather than closing the repair.

## Recordings and provenance

The four bundled replays came from `runs/baseline/F01`, `F02`, `F07` and `F08` in the original development environment. Provenance includes state/trace SHA-256 hashes and original timestamps. Each recording captures **one real agent decision**, not an entire maintenance lifecycle.

The older agent did not record `stage` or `definition_of_done`; the UI shows those fields as unavailable. In F07 the agent itself declined fraudulent actions, so the UI distinguishes agent refusal from a policy-gate denial. A denial is counted only when an actual gate event records it.

Baseline runtime artifacts are not committed upstream and are not copied by `agent-sync`. Existing bundled replays remain available. To regenerate them, supply a separate recording artifact directory containing `F01`, `F02`, `F07` and `F08`, each with `_state.json` and `trace.jsonl`:

```sh
make import-replays RECORDINGS_ROOT=/absolute/path/to/baseline-artifacts
make import-insights
```

The importer checks for missing baseline artifacts before replacing any bundled replay. `import-insights` reads the public case index from the managed agent copy and regenerates the clearly labelled portfolio fixture.

After a server restart, recordings remain available through `GET /api/sessions/<id>/recording`. Resuming a live Python world after restart is not implemented: replay its journal or start a new session. Errors and timeouts preserve recorded effects; unconfirmed writes are not automatically retried.

## Tests and build

Install test tools once and have Node.js 22+ available:

```sh
.venv/bin/python -m pip install '.[dev]'
make test             # Local tests; bridge tests skip without an agent root
make test-agent       # All tests; first follow the live dependency/sync setup above
make lint
make build
```

Bridge tests use the real CaseAgent, PolicyGate and MockAdapter with a scripted LLM client, without provider calls. Tests cover blocked writes, real effect receipts, player barriers, refusal delivery, property grounding, session isolation, JSONL journals, SSE resume, deduplication, legacy fields, Host/Origin validation and path confinement. BI tests cover evidence, estimation, matched cohorts, missing data, import validation and feedback binding.

`make build` produces `dist/` and `artifacts/lettings-village-static.zip` using an explicit file allowlist. Runtime sessions, imported private ledgers, local feedback, the agent clone and credentials are excluded.

Preview exactly the static deployment, without the Python API:

```sh
python3 -m http.server 8788 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8788`, not `dist/index.html` via `file://`. Simulation, manual character control, recordings and Intelligence all work here; live LLM sessions require the agent server. Browser data belongs to each origin, so localhost and a deployed site have separate cases and feedback. For static hosting the build command can be just `python3 -m scripts.build`: it uses the standard library and needs no package install, Node.js or agent clone.

## Hosting

For a public demo, use **Cloudflare Pages** connected to this GitHub repository: production branch `main`, framework **None**, build command `python3 -m scripts.build`, output directory `dist`, repository root as the build root. This publishes the full browser simulation, Replay and Intelligence; it makes no LLM calls. Pages can build a private repository when granted access, so publication of the repository can happen separately. See [Cloudflare's Git integration guide](https://developers.cloudflare.com/pages/get-started/git-integration/).

For the **live agent**, run the included Docker Compose stack on an always-on host and serve both the interface and API through a named Cloudflare Tunnel protected by Access. Keep its run volume persistent. This is a separate full application URL; the current client expects the API on the same origin. The [deployment guide](docs/DEPLOYMENT.md) includes setup commands, configuration, limitations and a launch checklist for both options.

## Deployment and handoff

- [Interactive cases, public evidence and participant control](docs/INTERACTIVE.md)
- [Agent dependency workflow](docs/AGENT_DEPENDENCY.md)
- [Plan and architecture](docs/PLAN.md)
- [Summary for the agent team](docs/AGENT_STREAM_HANDOFF.md)
- [BI, financial ledger and feedback](docs/INTELLIGENCE.md)
- [Cloudflare, Docker and environment setup](docs/DEPLOYMENT.md)
- [Integration protocol and API](docs/INTEGRATION.md)
- [90-second presentation script](video/GAME_DEMO.md)
- [Verification results and limitations](docs/VERIFICATION.md)

Cloudflare access is not needed locally. Docker/Compose and origin configuration are prepared for live hosting; the static build and `wrangler.jsonc` support the interactive simulator, recordings and BI on Pages. The live Compose configuration mounts `.deps/lettings-ops-agent` read-only by default. Run `make agent-sync` first. Public deployment and a complete real-provider live episode still require validation in the target environment.
