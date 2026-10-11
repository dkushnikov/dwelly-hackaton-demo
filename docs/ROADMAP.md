# Product backlog at the saved checkpoint

Status date: **11 October 2026**. Work is deferred; this document is not an
instruction to start implementation or incur model/hosting charges.
[STATE.md](STATE.md) records what ships. The detailed rationale and all 50 source
reviews remain in [CASE_REVIEW.md](CASE_REVIEW.md).

## Case Review status

| ID / priority | Status | Next acceptance criterion |
|---|---|---|
| UI-01 / P1: separate outcomes | Implemented for the current UI and simulations | Keep session/work/closure/payment separate. Live fields without evidence remain unknown. |
| UI-02 / P1: next-action queue | Implemented using available events | Owner, reason, next action, waiting time and recorded deadline/source are visible; missing dates stay unknown. Richer live fields depend on the agent contract. |
| UI-03 / P1: evidence and conflicts | Next | Show source event/document/page, claimant, dates, availability and review state. Referenced, missing, available and reviewed must differ. Show conflicting sources together. |
| UI-04 / P1: approval boundaries | Next | Bind approval to actor, scope/quote version, amount/currency/VAT basis, conditions and exclusions. A diagnostic visit must not authorise repairs. |
| UI-05 / P1: manual consequences | Implemented for existing public simulations | Specific choices explain what continues and what stays blocked; refusal/evidence requests persist without closing the case. Live text replies are not the same choice engine. |
| UI-06 / P2: visits/rescheduling | Pending | Proposed, confirmed, moved, no-show and complete states; both parties' confirmations, access conditions and change history. |
| UI-07 / P2: linked defects | Pending | Each defect has its own owner/evidence/closure. New messages can attach, reopen or create a case without hiding unresolved work. |
| UI-08 / P2: quote/invoice/payment | Pending | Follow approved quote → invoice → payment route → paid evidence; compare equal scope and tax basis. Existing BI estimates are not reconciliation. |
| UI-09 / P2: appliance history | Pending | Homes show device identity/ownership, symptoms, installer, warranty and repair/replacement history. |
| UI-10 / P2: keys/access | Partial, PM-021 only | General key inventory, intended recipients, physical return evidence and management-key/access restrictions. |
| UI-11 / P2: semantic timeline/delivery | Pending | Group reminders; filter conversations/decisions/effects/evidence; distinguish sent, acknowledged, duplicate and wrong-case messages. |
| UI-12 / P2: scenario library | Partial, fixed starter pack | Packs with a visible case list and filters by branch/roles/outcome; optional random seed. The 50 BI source cases are not 50 playable simulations. |
| UI-13 / P3: follow-ups/agent feedback | Partial, BI proposal reviews only | Decision-level reason codes, evidence references, expected action, versioned export and replayable regression inputs; reminders/repeated faults remain open work. |

## Next four deliverable slices

1. **Evidence and approval (UI-03/UI-04).** Add PM-043 (conditional permission) and
   PM-020 (email/PDF conflict). Start with explicit document linking and two
   prepared conflicts; extracting every PDF is separate work. Acceptance: missing
   evidence stays missing; changed scope needs a new decision; sources are visible.
2. **Operational exceptions (UI-06/UI-07/UI-10).** Add PM-030 (no-show), PM-040
   (unfinished promise), PM-047 (changed scope/double dispatch). Include denied
   access, rejected quote and missing-document branches. Acceptance: the queue
   always retains an owner and next step for unresolved work.
3. **Money and property memory (UI-08/UI-09).** Add PM-007 (quote/invoice mismatch)
   and PM-038 (tenant-owned appliance/disposal). Acceptance: verified, estimated
   and unknown amounts differ; no aggregation of incompatible scope or VAT bases.
4. **Library and review loop (UI-11/UI-12/UI-13).** Add named packs, optional seeded
   selection, PM-010 recurring readings and PM-049 tenant repair/fallback. Export
   feedback for team review; do not automatically alter policy or train the agent.

Keep the current four-story quick demo intact. In every slice, verify an automatic
path, a manual refusal/evidence request, reload, replay and the relevant BI/map state.
Success must follow required evidence rather than timers or the historical outcome.

## Release engineering backlog

- Finish the bounded deployed-provider verification described in STATE.md before
  calling the whole cloud live path verified.
- Establish a tested Python 3.12 dependency lock and pinned container base digest
  if long-term byte-for-byte builds are required. Current constraints capture one
  development environment; package indexes and container tags remain external.
- Consider CI for the existing no-provider checks. Do not put live keys in fork PRs.
- Shared team feedback storage, live-world recovery and multi-player identity are
  separate product changes, not behaviour included in this checkpoint.

## Upstream dependencies

Use [AGENT_FEEDBACK.md](AGENT_FEEDBACK.md) for structured evidence, next actions,
approval provenance, financial records and evaluation. Those are proposed joint
contracts; adding UI fields alone does not make them recorded agent facts.
