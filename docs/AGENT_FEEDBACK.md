# Feedback for the lettings-ops-agent team

Prepared by **Codex, OpenAI's engineering assistant working on the Lettings Village
demo**, 11 October 2026. The purpose is to make real decisions understandable,
auditable and controllable in the village and BI without changing the agent's
policy authority. This document is saved for handoff; it has not been sent to the
agent team or applied to their repository.

Scope: demo adapter at application commit `3d25272`, agent pin
`b0ef66d4d0dd58ab1499071fe580a18b8e9ce1c0`. These are integration observations and
contract requests, **not findings from a paid evaluation of this agent revision**.
Compatibility tests use the real harness with scripted model responses.

## What already connects correctly

- `CaseAgent.run`, PolicyGate and MockAdapter are used without modifying their rules.
- Each case keeps its world across rounds; different cases have isolated worlds.
- Participant replies enter the next context as untrusted artefacts. The scripted
  refusal test verifies delivery, not how a real model will reason about it.
- Trace events and confirmed `world.log` receipts reach the journal. The adapter
  flushes effects even when a round fails; it does not invent successful writes.
- The current contract already carries stage, hold reason, next step, checklist,
  handover and usage. Older bundled recordings lack some fields; that is not proof
  the current upstream version lacks them.

## Requests, evidence and acceptance

| Priority / request | Observable limitation in this integration | Proposed acceptance check |
|---|---|---|
| P0: one real bounded episode | No deployed provider episode is verified. Existing replays are older single decisions. | Run with explicit budget, record exact agent/model revision and usage, exercise a participant reply and retain the complete journal. Report unresolved work honestly. |
| P1: structured next action | `demo/protocol.py:owner_of` infers role from English hold/next-step text. `demo/engine.py` falls back to contractor or tenant when owner is agency. | Emit stable role/actor ID, question/action ID, reason, waiting-since, due date + source and blockers. Paraphrasing prose must not change the assigned player. |
| P1: separate outcome dimensions | `status_event` forwards workflow state; the live view has no separate evidenced work/closure/payment projection. `resolved` is one round's disposition. | Supply optional work outcome, closure basis, financial state and source refs. Completed inspection, repair, closure and payment remain independently unknown or confirmed. |
| P1: approval provenance/scope | The demo forwards untrusted replies; it cannot safely turn a player's “yes” into mandate authority. | Bind approval to verified author, property, scope/quote version, amount/currency/tax basis, conditions and evidence. An altered quote must invalidate obsolete approval. |
| P1: evidence objects and conflicts | The current status projection has no document availability/review/conflict model. | Stable evidence IDs, source type, original event/document/page, event/recorded times, availability and review state. A referenced attachment is not automatically available or reviewed. |
| P1: correlated actions and financial records | The UI joins trace, gate, receipt and actor through partial identifiers; BI has no authoritative live invoice/payment projection. | Carry stable case/action/property/actor IDs through proposal → gate → attempt → receipt, and link quote/invoice/payment evidence with tax basis and payer. Retries must not double-count effects or money. |
| P2: evaluation packet | Feedback exports exist for BI proposals, but there is no episode judge/regression comparison loop. | Export decision/event refs, reason code, expected action, comment, agent/source version and evidence hash. Run regressions separately; feedback grants no authority and does not mutate the original journal. |
| P2: shared-world/recovery contract | Demo worlds are per-case; live worlds do not resume after restart. Journals survive only as playback. | Decide ownership of a shared scheduler and snapshots before implementing contractor contention, cross-case work or recovery. Version any restore format. |

These describe gaps in the **demo-facing projection**. Before changing upstream,
check whether its current schema already has equivalent fields and extend the
adapter instead. Do not remove useful upstream data or introduce a second tick
driver without agreeing which component owns time, participants and retries.

## Suggested joint evaluation cases

1. PM-017: tenant confirms the switch advice worked; no invented contractor order,
   invoice or payment. If advice fails, keep work unresolved or justify another path.
2. PM-021: repair can finish while physical key return is still outstanding.
3. PM-025: disputed warranty and parts wait; cover confirmation does not imply the
   repair is complete or authorise chargeable work.
4. PM-043: approve a limited scope, then introduce an extra component. The new work
   needs a fresh decision unless recorded authority explicitly covers it.
5. PM-020 / PM-007: conflicting message/document or quote/invoice; preserve both
   claims and identify the missing check rather than choosing a convenient amount.
6. A landlord declines a quote, an actor tries payment diversion, and a tool times
   out after a confirmed write. Respect refusal, distinguish voluntary refusal
   from gate denial, and avoid a duplicate order on the next round.

Use public cases only as development examples. Pass intake/current evidence to a
live run, not the historical future outcome. Record failures and handovers as well
as successes; all 50 source cards being completed is not an agent success rate.

## Feedback schema to discuss (not implemented)

`feedback_id`, `session_id`, `decision_id`, `event_refs`, `evidence_hash`,
`agent_revision`, `model`, `reason_code`, `expected_action`, `comment`,
`review_status`, `authority_granted: false`.

Initial reason codes: `wrong_owner`, `unsupported_effect`, `missing_evidence`,
`scope_exceeded`, `duplicate_action`, `premature_closure`, `ignored_refusal`,
`money_mismatch`. Human annotations and any automated scores should be separate
from the append-only factual journal.

## Where to work

Demo changes: [engine](../demo/engine.py), [protocol](../demo/protocol.py),
[case projection](../demo/web/case-view.js), [bridge tests](../tests/test_bridge.py),
[BI contract](INTELLIGENCE.md). Upstream changes belong in the separate agent
repository. Update the demo pin explicitly only after reviewing compatibility.
