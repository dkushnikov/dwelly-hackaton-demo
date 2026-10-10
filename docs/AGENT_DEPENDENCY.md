# Agent dependency workflow

The demo owns an independent Git clone at `.deps/lettings-ops-agent` and a separate Python environment at `.venv`. Neither uses the source team's working directory. `agent-source.json` pins an upstream commit; it is the only dependency metadata that belongs in demo commits.

## Set up or reproduce a revision

```sh
python3 -m venv .venv
.venv/bin/python -m pip install '.[live,dev]'
make agent-sync
make test-agent
make game
```

`agent-sync` clones the configured GitHub repository when needed and switches the managed copy to the exact pinned commit in detached-HEAD mode. It does not copy uncommitted files, `.env` files, credentials or the source team's environment. Git sparse checkout materializes runtime modules, agent data, fixtures, public data and metadata. It excludes hooks and agent instruction files. No submodule is required.

Ordinary `make game` only checks the local revision and starts it. Replay mode and the static build require neither an agent clone nor GitHub access.

## Update from upstream

1. Stop live sessions and preserve any needed recordings.
2. Run `make agent-update`. It fetches the configured branch, requires it to descend from the pinned commit, checks for required runtime files, checks out the new commit and updates `agent-source.json`.
3. Run `make test-agent` and `make lint` in the demo's environment. If the upstream contract changed, fix the adapter here or select a previously compatible pin; do not edit the dependency.
4. Review the lock-file diff and record it with the associated demo change. Restart the live server.

The sync tool refuses a different origin, a symlink, a shared Git worktree, local edits or untracked files. A separate path check rejects ignored files that would conflict with the target revision before switching. It never pushes, commits, merges, resets, stashes or cleans the dependency. Non-fast-forward upstream changes require an explicit review of the pin.

To reproduce an older compatible version, edit `revision` in `agent-source.json` to its full commit SHA and run `make agent-sync`. This moves the detached dependency checkout without rewriting history. Keep it stopped while changing revisions.

## Data and recordings

`make import-insights` reads `data/pm-cases-index.json` from the managed copy. Built-in replay files already live in the demo repository and remain usable independently.

Original `runs/baseline` output was untracked runtime data, so it is not available from a fresh agent clone. To rebuild the baseline replays, provide artifact directories separately:

```sh
make import-replays RECORDINGS_ROOT=/absolute/path/to/baseline-artifacts
```

Expected layout: `F01/_state.json`, `F01/trace.jsonl`, and equivalent pairs for F02, F07 and F08. No automatic synchronization runs on startup, and updating the agent does not rewrite bundled demo data.

## Deployment

The live Compose override uses `./.deps/lettings-ops-agent` relative to the root Compose file and mounts it read-only at `/agent`. Missing source directories are rejected rather than created silently. `LETTINGS_AGENT_ROOT` can explicitly select a separately provisioned copy on a deployment host.

Run `make agent-sync` on that host before starting the container. The runtime Python packages are installed by the live Docker image. The agent checkout is excluded from the static deployment ZIP and the Docker build context.

## Verification

The dependency manager has local Git fixture tests for pinned sync, forward updates, dirty-tree refusal, non-fast-forward refusal, origin mismatch and preserving ignored files. `make test-agent` then exercises the actual pinned harness with a scripted provider, without credentials or paid model calls. Exact results for this migration are recorded in `docs/VERIFICATION.md`.
