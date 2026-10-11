# Fork, reproduce and continue

The repository contains everything needed for the browser simulation, BI and
bundled replays. Cloudflare access, provider credentials and an agent checkout are
optional. Start with [STATE.md](STATE.md), then choose work from [ROADMAP.md](ROADMAP.md).

## Fresh local setup

Fork `dkushnikov/dwelly-hackaton-demo` on GitHub, clone your fork, and open its root.
To reproduce a checkpoint, check out its saved full commit or release tag before
installing. A branch such as `main` can move; keep the full SHA with your notes.

This checkpoint is `v0.1.0-demo`: after cloning, run `git switch --detach v0.1.0-demo`.
To begin new work from it, use `git switch -c codex/your-change v0.1.0-demo`.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -c constraints/checkpoint-2026-10-11.txt .
make game-replay
```

Open `http://127.0.0.1:8787`. Choose **Start the village** for the fixed pack or
**New case** for manual roles. No model calls occur in simulation/replay mode.
For a static build, `python3 -m scripts.build` needs only Python's standard library;
serve `dist/` over HTTP as described in [README.md](../README.md).

## Reproduce development checks

```sh
.venv/bin/python -m pip install -c constraints/checkpoint-2026-10-11.txt '.[live,dev]'
make agent-sync
make agent-status
make test-agent
make lint
make build
```

These constraints record installed dependency versions at the checkpoint. They
do not install undeclared packages or replace the npm lock. They were captured on
Python 3.14.7/macOS; Python 3.12 is the supported minimum but a fresh constrained
install on every platform has not been verified. Report resolver problems rather
than silently updating the checkpoint. The Python container image still uses the
declared ranges and a mutable base tag; see the release-engineering backlog.

Node.js 22+ runs the frontend tests. Cloud checks also need the pinned npm tools:

```sh
npm ci
npm run test:cloud
```

The smoke test binds local ports and uses synthetic credentials, without a model
call. Running it does not validate an actual deployed container.

Use `agent-sync`, not `agent-update`, to reproduce the saved upstream revision.
For a deliberate upgrade, follow [AGENT_DEPENDENCY.md](AGENT_DEPENDENCY.md). A fork
can retain the public upstream URL or explicitly pin its own compatible fork.

## Your own hosting

- Static only: use [DEPLOYMENT.md](DEPLOYMENT.md), `wrangler.jsonc`, and `dist/`.
- Full application: use [CLOUDFLARE.md](CLOUDFLARE.md). Change the Worker name and
  `PUBLIC_ORIGIN` in `wrangler.live.jsonc` to your own app/hostname. If hosting a
  second copy in the same account, also use a unique container name and update
  the matching `exports.VillageContainer.container` reference. Preserve the class
  and binding relationships; do not point a fork at another app's data.
- Connect the fork to your own Cloudflare account. Owner provisioning of the demo
  password and provider key happens directly in that account. No existing secrets,
  permissions, journals, budgets or subscriptions transfer with Git.
- In the original deployment, pushing the connected production branch triggers a
  Cloudflare build. A documentation commit can trigger it too. Keep a freeze branch
  separate or configure your own deployment branch before publishing changes.

## Preserve a checkpoint

The source manifest in `docs/releases/2026-10-11.json` records the deployed base
commit and hashes for runtime source, bundled data and dependency metadata.
Git records the accompanying docs and license. For a future owner-authorised release,
commit the reviewed checkpoint and create a new annotated tag;
do not overwrite an existing tag. Publish that commit/tag only with explicit
authorisation. Neither a document nor a ZIP alone creates a Git release.

Before clearing runtime state, export any needed case journals and BI feedback
through the UI. Keep private exports outside public source. A repository checkout
does not restore browser storage, cloud databases or a running Python world.

To check the saved source/data against the manifest from the repository root:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
manifest = json.loads(Path('docs/releases/2026-10-11.json').read_text())
for name, expected in manifest['sha256'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == expected, name
print('Checkpoint source/data checksums match')
PY
```

## Licensing and attribution

Original code and documentation are Apache-2.0; see [LICENSE](../LICENSE).
Keep [NOTICE](../NOTICE) and [LICENSE-THIRD-PARTY](../LICENSE-THIRD-PARTY) with
redistributions. Original procedural artwork retains its CC0-1.0 dedication.
Dwelly public-case source material and derived evidence/index data retain their
source attribution and terms; the new code license does not relicense that corpus.
The bundled examples are development material, not proof of agent performance.
