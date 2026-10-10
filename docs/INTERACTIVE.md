# Interactive village and public-case success

The browser supports complete, deterministic simulations alongside the original recorded and live agent modes. Use `make game-replay` or the static build: simulation needs no credentials, agent checkout or server API. The AI label in this mode means a scripted persona, not a language model.

## Try it

1. Open the village and click **Start the village**. This fixed pack adds PM-021, PM-017, PM-025 and a synthetic fraud case concurrently with all participants automatic. There is no random selection, and existing sessions stay. The entire pack needs four free slots. Use 4× to speed up the presentation.
2. Open **Cases** for the next-action queue. Filter by active, your turn, needs a human, waiting for a reply, missing evidence, overdue in scenario time, scenario checks passed, or other finished runs. Search by title, public case ID, property, owner or waiting reason. Open the specific decision, handover or outcome from its row.
3. Choose **New case** or a story. Select the home, then set each role to **AI** or **You** independently. The home identifies the tenant and landlord. Operator routing and contractor selection happen inside the case; choosing **You** reserves control of a role when it becomes involved. Multiple manual roles use the same browser, taking turns.
4. A manual turn pauses that case. Read the current question, recent participant evidence and each choice’s consequences. Select a contextual choice, inspect the preview, and confirm it with the named action button. Optionally add a note; the simulator does not interpret free-form notes. A refusal or supporting-evidence request keeps the case open at the unresolved step and appears in the queue; confirm later or stop the session.
5. Reload to resume simulations, including pending turns. Export JSONL for audit or playback. Importing JSONL does not restore interactive control.

The **Scenario checks passed** badge describes the simulation run. The case overview separately shows session state, work outcome, case closure and financial status. A finished recording never implies a completed repair, closed case or paid invoice. The production agent's old replays remain unchanged, including their unrecorded checklist/stage fields.


## Case Review: first implementation

This iteration implements UI-01 (separate outcomes), UI-02 (the next-action queue), and UI-05 (manual choices with consequences) from [Case Review](CASE_REVIEW.md).

- **Independent facts:** work may be complete while closure is pending; closure may be recorded while payment remains unknown. Evidence links open the actual session event. PM-017 reports *working after advice* and *closed without payment*, without inferring a zero charge. PM-021 keeps closure pending after the lock repair until office key return and final review. PM-025 separates investigation, confirmed manufacturer cover and a completion report stating no landlord charge. No simulation claims that an invoice was paid.
- **Actionable queue:** every row shows the next owner, waiting reason, next action, recorded waiting time, deadline/source and visit information. A declined scope and a request for evidence remain visible after reload. Recorded overdue obligations sort first, then human decisions, missing evidence, active cases and finished sessions. A missing deadline says *Not agreed / not recorded*. Comparisons use the latest valid `sim_time` in that case; wall-clock time and playback milliseconds do not create overdue work.
- **Contextual decisions:** the three public scenarios offer a supporting-evidence request in addition to their specific positive and negative choices. A preview states what will continue and what stays blocked. Recent participant messages are available beside the decision; the full timeline and historical source remain separate. Warranty investigation does not authorise chargeable work. A negative fan answer keeps the scenario open and does not invent an automatic contractor branch.
- **Consistent map attention:** playable turns, missing evidence, explicit refusals and recorded human handovers use the same action model as Cases. A recorded handover can be inspected but never becomes an interactive replay turn.

The simulator adds `status.case_facts` and `status.next_action` to new browser journals and consequence text to each manual choice. These fields are explicitly marked simulated. The live agent contract currently supplies owner, stage, hold reason, next step and handover; the UI uses an explicit handover deadline where available, but does not invent separate live work/payment results or confirmed visit times. Older saved simulations without the new fields show the available recorded status and unknown outcomes until new evidence is emitted. An older pending turn may have no consequence preview.

This is not the full evidence workspace or approval-scope editor. Document availability/review states and conflicts (UI-03), conditional approval/quote versions (UI-04), editable appointments, linked defects and invoice reconciliation remain later iterations. Supporting-evidence requests here pause the existing scenario; they do not fetch documents or contact a real participant.

## Public cases and success checks

Sources: `DwellyOrg/HackatonPublicCases`, revision `9bcdca585955dfb930005ed742572606e68f5688`, track **Property Management**. These are public development examples, not the separate private challenge submissions.

| Case | Source event anchors | Simulated closure requirements |
|---|---|---|
| PM-021 Key Replacement | 006 approval; 020 cylinder and handles replaced; 025 no quote needed; 028 key return; 029 closure | Approval, provider acceptance, access, completion report, four-key distribution and explicit office return, final review |
| PM-017 Extractor Fan | 008 landlord's switch advice; 011 tenant confirmation; 014 closure without payment | Advice, tenant confirms the fan works, final review; no work order or payment |
| PM-025 Oven Repair | 020 disputed warranty; 042 manufacturer cover; 050 parts wait; 062 charge-free completion; 064 closure | Warranty checked and confirmed, scope, provider, access, parts wait, completion report, final review; no payment |

`public-scenarios.json` contains the public intake, outcome summary, selected original events, source URLs, revision and hashes. The UI's **View public case evidence** opens that material. Runtime dialogue is an adaptation. Names, properties and timing differ from the original public records. PM-025 has inconsistent source appointment dates; the UI discloses that and uses relative simulation time.

Rebuild the source bundle from a read-only checkout of the public corpus:

```sh
.venv/bin/python -m scripts.import_scenarios /absolute/path/to/HackatonPublicCases
```

The public outcome is never evidence of actual LLM performance. Starting a public story in live mode passes only its initial report and selected village property; future outcome/history remains outside the live prompt. A simulated successful repair is not a real work order, invoice or payment.

## Other branches

- Repair / spending approval: landlord decision, provider, access, work report, resident confirmation, final review.
- Vulnerable resident: priority welfare handover precedes repair coordination.
- Fraud: payment change is blocked; trusted-contact verification and incident review close the incident. No repair or payment is claimed.
- Free-form safety report: the demo recognises a small set of safety words and routes to an unresolved emergency handover. It cannot certify real-world safety or infer arbitrary issue semantics. Other free-form descriptions use the generic maintenance workflow.

Each case owns its event list, participant assignments, pending prompt, simulated clock and completion evidence. The dispatch step checks that approval, provider and access evidence exist. Closure checks every required evidence item. Wrong-role, stale-prompt and unknown-choice responses are rejected. Simulations emit no model usage and are listed separately in the BI Agent activity view, even when a simulation journal is imported as replay.

At intake, the simulator routes ordinary maintenance to the Property manager, payment diversion to the Finance desk, and safety/vulnerability cases to the Safeguarding desk. It selects a contractor by trade when the workflow reaches provider selection, after approval. Selection is recorded separately from dispatch and does not itself issue a work order. PM-017 completes without involving a contractor, even if that role is set to **You**. Routing is deterministic: free-form trade detection uses a small keyword set with general maintenance as the fallback, not live availability or bidding. Assignment events are visible in the timeline and survive export/reload. Previously saved sessions retain their existing cast.

## Live mode

The same participant-control form supports the real agent when its server is available. Each role can pause for a human or be supplied by the selected scripted/LLM director. The agent chooses actual mock-world contractors and decides when operator input is required; the form does not preassign either. The agent's gate still governs writes, and actor replies remain untrusted.

Compatibility tests exercise multiple human roles against the pinned real harness with a scripted provider. A complete paid-provider episode has not been verified. Live agent rounds are bounded; there is no promise that every model run ends successfully.

## Persistence and limits

The map labels every home: grey for no cases or unverified finished runs, amber for active runs, red for a playable manual turn, a recorded human review, missing evidence, declined/unclear decisions or an overdue recorded obligation, and green when all of that home's cases ended with an explicit success outcome. Recorded prompts are never playable turns. The label, tooltip and accessible name expose counts; colour is not the only signal. Simulation success remains simulated evidence. Click the landlords or contractors meeting place to open People with that role selected; these are directory landmarks, not extra rental properties.

**Full screen** uses the browser fullscreen API where available and otherwise expands the map inside the viewport. Escape or the exit button restores the workspace. Home and People dialogs work above the expanded map, and opening a case list exits it. The canvas renders at an integer backing scale based on display density, capped at 4× (3072×1920); labels above the homes are native text. This is separate from the existing presenter layout.

**People** supports word search across names, roles, trades, home IDs and addresses. Quote a phrase such as `"Richmond Road"` to match that street instead of separate words. Role, home and control filters combine. AI/You is tied to assignments in individual cases, including completed cases; recorded sessions are labelled Recorded. Contractor control choices are not shown as assignments until a contractor is selected. Identically named tenants remain separate by home. Open a person's card for linked homes and cases.

**Homes** (`/#homes`) has search, landlord and case-activity filters. Each property shows its resident, landlord, active/waiting/total case counts, and actions to inspect the home, view its cases or report an issue with the home preselected. Replay prompts never count as waiting for a player.

**Replay** opens a chooser dialog before opening the operating system's file picker. Select one of the four bundled recordings or choose a Village `.jsonl`/`.ndjson` export under 2 MB. Validation errors stay inside the dialog. BI ledger JSON goes through Intelligence's separate importer.

**Reset demo** defaults to browser sessions only. The wider scope also clears BI reviews, imported ledger and analysis settings. Neither scope removes homes, people, source data, installed offline assets or bundled recordings. A backup under `lettings-village-reset-backup-v1` is written before removing any app storage; if it cannot be saved, clearing does not start. Other applications' storage is untouched. Undo is available from Reset after a reload. It restores simulations (including pending turns), replay positions and selected BI state, paused; newly created cases are kept, subject to the 32-case limit. Restored BI state replaces current BI state. A subsequent reset replaces the prior undo backup.

When a live server is connected, a separate unchecked option stops and clears its current sessions for all viewers. Server journals are retained; local Undo cannot resume a stopped live agent. A concurrent session created after reset begins is not removed. If the live reset cannot be confirmed, the dialog reports the partial result and retains the local undo backup.

Simulation state is stored in this browser under `lettings-village-sim-v1`. It is not a shared team queue, authentication system or multi-player room. Another browser/device does not see these local simulations. The server's live-session snapshot supplies live cases while that server remains running. Old server journals remain downloadable after restart, but live Python worlds do not resume.

The workspace caps cases at 32. **Clear finished simulations** removes completed simulation state from this browser; export any journals you need first. Recorded and live sessions are unaffected. Browser storage failures are surfaced; corrupt archives are not silently overwritten. The simulator is intended for interactive demonstrations, not tamper-proof scoring.
