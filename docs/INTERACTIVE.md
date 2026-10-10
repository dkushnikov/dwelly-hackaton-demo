# Interactive village and public-case success

The browser supports complete, deterministic simulations alongside the original recorded and live agent modes. Use `make game-replay` or the static build: simulation needs no credentials, agent checkout or server API. The AI label in this mode means a scripted persona, not a language model.

## Try it

1. Open the village and click **Start the village**. PM-021, PM-017, PM-025 and a synthetic fraud case run concurrently with all participants automatic. Use 4× to speed up the presentation.
2. Open **Cases** to filter active, waiting, successful and other finished runs. Search by title, public case ID or property. Open a case to inspect its timeline, source evidence and completion checklist.
3. Choose **New case** or a story. Select the home, contractor and operator; assign each named Tenant, Landlord, Contractor and Operator to **AI** or **You** independently. Multiple manual roles use the same browser, taking turns.
4. A manual turn pauses that case. Select an explicit decision and optionally add a note. The simulator does not interpret free-form notes. A negative choice keeps the case open at the unresolved step; confirm later or stop the session.
5. Reload to resume simulations, including pending turns. Export JSONL for audit or playback. Importing JSONL does not restore interactive control.

The status badge distinguishes **Success** from a merely finished, cancelled or unresolved run. The production agent's old replays remain unchanged, including their unrecorded checklist/stage fields.

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

## Live mode

The same participant-control form supports the real agent when its server is available. Each role can pause for a human or be supplied by the selected scripted/LLM director. The agent chooses actual mock-world contractors; the browser's contractor selection is used only by the deterministic simulator. The agent's gate still governs writes, and actor replies remain untrusted.

Compatibility tests exercise multiple human roles against the pinned real harness with a scripted provider. A complete paid-provider episode has not been verified. Live agent rounds are bounded; there is no promise that every model run ends successfully.

## Persistence and limits

Simulation state is stored in this browser under `lettings-village-sim-v1`. It is not a shared team queue, authentication system or multi-player room. Another browser/device does not see these local simulations. The server's live-session snapshot supplies live cases while that server remains running. Old server journals remain downloadable after restart, but live Python worlds do not resume.

The workspace caps cases at 32. **Clear finished simulations** removes completed simulation state from this browser; export any journals you need first. Recorded and live sessions are unaffected. Browser storage failures are surfaced; corrupt archives are not silently overwritten. The simulator is intended for interactive demonstrations, not tamper-proof scoring.
