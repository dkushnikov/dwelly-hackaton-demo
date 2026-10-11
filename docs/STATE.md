# Saved checkpoint — 11 October 2026

This is the entry point for continuing the project without the original chat.
Feature development and paid-provider verification are deferred at the owner's
request. The deployed service has not been shut down by this checkpoint operation.

## Identity

- Application: Lettings Village, Python package version `0.1.0`.
- Release tag: `v0.1.0-demo` (use `git rev-parse 'v0.1.0-demo^{commit}'` for its full SHA).
- Demo repository: <https://github.com/dkushnikov/dwelly-hackaton-demo>.
- Deployed application source before this documentation/licensing checkpoint:
  `3d25272d39e001f01309692c21b4e960140c1586`.
- Agent repository: <https://github.com/dkushnikov/lettings-ops-agent>, pinned at
  `b0ef66d4d0dd58ab1499071fe580a18b8e9ce1c0` in `agent-source.json`.
- Public examples: `DwellyOrg/HackatonPublicCases`, revision
  `9bcdca585955dfb930005ed742572606e68f5688`.
- Hosted demo: <https://lettings-village.dkushnikov.workers.dev/>.
- Source/data checksums: [checkpoint manifest](releases/2026-10-11.json).

The deployed source SHA identifies the application published before this handoff.
The release tag identifies the later checkpoint with documentation, licensing and
packaging cleanup. The full checkpoint SHA is obtained from Git instead of embedding
a self-referential commit hash in its own contents.

## What is ready

- Six homes, 21 participants, simultaneous browser cases, map status indicators,
  readable labels, fullscreen view and clickable People shortcuts.
- Homes and People directories with filters; independent AI/manual control of each
  role; scenario-based operator routing and contractor selection.
- Fixed four-case village pack, three complete public adaptations (PM-017, PM-021,
  PM-025), additional synthetic branches, four authentic single-decision recordings.
- Local simulation persistence, contextual decisions, reset/undo and replay chooser.
- BI: 50 public cases, a separately labelled 84-job synthetic portfolio, activity,
  estimates, proposals, local reviews and feedback export.
- Case Review iteration 1: UI-01 separate outcomes, UI-02 action queue and UI-05
  manual consequences. The details are in [INTERACTIVE.md](INTERACTIVE.md).
- Isolated, pinned agent integration; HTTP/SSE, player turns, journals and replay.
- Cloudflare Worker/assets, shared-password gate, on-demand Python Container,
  persistent journal/budget Durable Objects and bounded model proxy.

## Verification boundary

The pre-checkpoint suite passed 68 Python and 53 JavaScript tests. Lint and local
Cloudflare gateway smoke passed. PM-017's manual evidence-request/reload/success
flow was browser-tested. See [VERIFICATION.md](VERIFICATION.md) for actual outputs,
including the fresh checkpoint checks.

Cloudflare Workers Builds successfully built the image and deployed source
`3d25272` (build `c7a8ceee-016b-44ed-882b-6141c089537d`). The hosted password login
page was observed. The owner provisioned secrets directly. Secret values are not
part of this repository or verification evidence.

**Still unverified:** a paid Anthropic request through the deployed Container,
external live SSE/manual turns, and loading that live journal after cloud container
shutdown. Local gateway persistence tests are not proof of those external flows.
The checked-in simulations are successful adaptations, not LLM evaluation results.

## Limits worth preserving

- Simulation/BI state is local to a browser origin. Git is not a backup of it.
- Cloud viewers share a password and live queue; there are no individual accounts.
- Local live worlds are in Python memory. Cloud journals persist, but interrupted
  worlds cannot resume from JSONL. Import creates playback only.
- Cloud allows one live session, at most four rounds, scripted personas, a 15-minute
  session deadline and a 30-minute container lifetime. The provider ledger limits
  this deployment to $5 total at the configured rates; it is not an account-wide cap.
- Workers Paid remains $5/month plus usage. Saving the repository does not cancel
  hosting, subscriptions or billing. No cloud resource was removed during cleanup.
- Python extras use version ranges and Docker uses `python:3.12-slim`. The saved
  constraints record the tested development environment, not a universal or
  bit-for-bit Docker lock. No fresh constrained network install has been verified.
- Original baseline source traces are not in Git. The transformed bundled replays
  and their provenance are retained and work without those source traces.

## Resume in order

1. Follow [FORKING.md](FORKING.md) to check out this checkpoint and run replay mode.
2. Read [ROADMAP.md](ROADMAP.md); choose a concrete item rather than updating
   everything at once. UI-03/UI-04 are the next product iteration.
3. For live work, restore the existing pin with `make agent-sync`, install the live
   dependencies, then run `make test-agent`. Do not start with `agent-update`.
4. When explicitly resuming cloud verification, start one one-round live case,
   inspect actual provider usage/SSE, export its journal, then test a manual turn
   and journal persistence. Do not claim repair success from a completed round.
5. Coordinate event-contract changes using [AGENT_FEEDBACK.md](AGENT_FEEDBACK.md).
6. Update the verification record and checkpoint metadata for the next release.

## Files and state intentionally excluded

Credentials, `.deps`, `.venv`, `node_modules`, build outputs, local test artifacts,
runtime journals, private imported ledgers, browser feedback and cloud database
contents are not source. Preserve needed journals through Replay/export and BI's
feedback export before clearing browser/server state. Never add credentials to an
archive. A fork creates fresh cloud state and needs its own deployment setup.
