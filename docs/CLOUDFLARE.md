# Cloudflare deployment

Run the village and BI as Worker assets, with the pinned Python agent in one on-demand Container. The account's free `workers.dev` hostname needs no purchased domain, VM, Tunnel or email identity provider.

**Release status:** local workerd tests pass for authentication, asset/API protection, concurrent budget reservations and SQLite persistence. The image build and a deployed provider request still require verification. The hostname in the configuration is not proof of a deployed service.

## Components

- `wrangler.live.jsonc`: Worker, protected assets, login rate limiter and two SQLite Durable Objects.
- `VillageContainer`: one named `shared-demo-v1` instance, started only by a new live case. It stops after 30 minutes even with an open SSE tab; each case has a 15-minute deadline, at most four rounds and scripted automatic participants. Only one live case runs at a time.
- `DemoLedger`: persists events before publication and stores shared provider spending reservations. Reset and container shutdown preserve it. Replay → Saved live cases lists the latest 100 journals; each journal is limited to 2 MB.
- `Dockerfile.cloudflare`: fetches the public agent repository at the exact `agent-source.json` commit. It never copies a developer's working tree or credentials. A changed pin requires rebuilding the image.
- Private container egress: the container cannot reach the Internet directly. Its `village-internal` hostname routes journal writes and model requests through a Worker entrypoint. The real Anthropic key stays in the Worker; the container receives a non-secret placeholder.

Active Python worlds do not resume after a container restart. Their journals survive as playback, without inventing a successful outcome. Browser simulations and BI reviews remain local to each browser. Signed-in viewers share live cases and can answer/cancel them; this is a shared password, not individual accounts.

## Build and deploy

Requirements: Workers Paid, Node.js 22+, public source repositories and the Python setup from the root README. Wrangler is pinned in the npm lock file and is deployment tooling only.

```sh
npm ci
make agent-sync
make test-agent
make lint
npm run test:cloud
```

The smoke check uses local workerd processes and synthetic credentials, with no provider calls. It needs permission to bind localhost ports.

With Docker installed and running locally:

```sh
npm run deploy:cloud -- --dry-run
npm run deploy:cloud
```

Alternatively use **Cloudflare Workers Builds**, which builds the image in the cloud:

1. Publish reviewed changes to the deployment branch, normally `main`.
2. In Workers & Pages, import `dkushnikov/dwelly-hackaton-demo` as a Worker named `lettings-village`. Grant GitHub integration access only to this repository.
3. Use the repository root, build command `npm ci`, and production deploy command `npm run deploy:cloud`. Disable non-production branch builds for this shared demo. `wrangler versions upload` does not build container images.
4. Match `PUBLIC_ORIGIN` in `wrangler.live.jsonc` to the exact HTTPS hostname. Preview URLs are disabled; other origins are rejected.
5. Deploy. Until a password exists, the Worker deliberately returns `503 Owner setup required` and exposes neither the assets nor API.
6. The owner enters the following **runtime secrets** in Worker Settings → Variables and Secrets, then deploys the settings. Never put them in source, plaintext variables or Docker build arguments.

| Secret | Purpose |
|---|---|
| `DEMO_PASSWORD` | Strong shared password, at least 12 characters. Rotation invalidates existing cookies. |
| `ANTHROPIC_API_KEY` | Key for the demo's provider workspace. Without it, simulation/replay/BI still work after login; live case creation is disabled. |

Sign in at `/login`. Cookies are signed, Secure, HttpOnly, SameSite=Strict and expire after eight hours. Mutations require the exact Origin. Login is limited to ten attempts per minute per Cloudflare location/IP. The hosted version disables offline caching. Sign out clears the login cookie and browser cache. Local simulation/BI data remains on that browser; use Reset demo to clear it.

## Spending

Workers Paid costs **$5/month plus usage**, not a hard $5 ceiling. Compute, requests, storage and builds can incur metered fees. One named container and automatic shutdown reduce usage but do not cap the Cloudflare bill. Use billing alerts and stop live activity after the presentation.

The provider proxy pins `claude-haiku-4-5-20251001`, accepts at most 8,000 output tokens and only custom agent tools. Each outbound request atomically reserves **$0.44** from a **$5 total** persistent ledger: 200,000 input tokens at the highest supported cache-write rate ($2/MTok) plus output at $5/MTok. A valid successful usage receipt reduces the reservation to the calculated amount. Missing/invalid receipts, failures and timeouts retain the reservation; each retry reserves again. No reset endpoint replenishes this budget.

This guard covers only this deployment at the documented Haiku 4.5 prices. It is not an account-wide provider cap or a billing statement. Set the Anthropic workspace's own limit as well; recheck pricing before changing models/rates. Conservative reservations can block a call while some balance remains. Browser simulations make no paid model calls.

## Release verification

1. A fresh signed-out browser sees only login. Direct API and asset requests must not expose private content.
2. After login, run a simulation and open BI/Replay. These must not start a Container or make provider calls.
3. Start one live case with one round. Observe SSE, verify model/provider usage and export its journal before increasing the round count.
4. Answer a manual turn, refresh, and check that it is not duplicated.
5. Stop/reset live cases. After container shutdown, load the journal from Replay → Saved live cases. Playback is not a resumed world.
6. Check build/startup results without logging secret values. Deploy is not transactional: a Worker can be published before an image build fails.

Official references: [Workers Builds and container deployment](https://developers.cloudflare.com/containers/guides/deploy/), [container lifecycle API](https://developers.cloudflare.com/containers/api/durable-object-container/), [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/), [Haiku 4.5 pricing/limits](https://platform.claude.com/docs/en/models/haiku-4-5/overview).
