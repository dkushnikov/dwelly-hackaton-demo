"""Convert real harness recordings into small, provenance-bearing village replays."""

import argparse
import hashlib
import json
from pathlib import Path

import yaml

from demo.protocol import effect_event, status_event, summary_of, trace_event
from demo.scenarios import SCENARIOS


def convert(root, output, recordings_root=None):
    recordings_root = recordings_root or root / "runs/baseline"
    missing = [str(recordings_root / scenario["fixture"].split("-", 1)[0] / name)
               for scenario in SCENARIOS for name in ("_state.json", "trace.jsonl")
               if not (recordings_root / scenario["fixture"].split("-", 1)[0] / name).is_file()]
    if missing:
        raise ValueError("Baseline recordings are not part of the agent Git checkout. Supply RECORDINGS_ROOT with _state.json and trace.jsonl for F01/F02/F07/F08. Bundled replays remain unchanged.")
    output.mkdir(parents=True, exist_ok=True)
    catalog = []
    for scenario in SCENARIOS:
        fixture = root / "fixtures" / scenario["fixture"]
        spec = yaml.safe_load((fixture / "case.yaml").read_text())
        run = recordings_root / spec["id"]
        state_bytes = (run / "_state.json").read_bytes()
        trace_bytes = (run / "trace.jsonl").read_bytes()
        state = json.loads(state_bytes)
        actions = list(state.get("actions", []))
        events = []

        def add(e, events=events, spec=spec):
            events.append({**e, "v": 1, "seq": len(events) + 1, "tick": 1,
                "sim_time": spec.get("received_at"), "at_ms": len(events) * 950})

        provenance = {"kind": "recorded_agent_run", "case": spec["id"], "source": f"lettings-ops-agent/runs/baseline/{spec['id']}",
            "state_sha256": hashlib.sha256(state_bytes).hexdigest(), "trace_sha256": hashlib.sha256(trace_bytes).hexdigest(),
            "timing": "compressed; original trace timestamps preserved", "legacy_status": not bool(state.get("stage"))}
        add({"t": "ticket_opened", "ticket": spec["id"], "property": spec["metadata"]["property_hint"],
             "issue": spec["title"], "mode": "replay", "provenance": provenance})
        for artifact in spec["artefacts"]:
            if artifact.get("trust") == "untrusted" or artifact["kind"] in ("email", "call_transcript"):
                add({"t": "actor_message", "role": "contractor" if scenario["id"] == "fraud" else "tenant",
                     "channel": artifact["kind"], "body": (fixture / artifact["file"]).read_text(), "source": "recorded fixture"})
        for line in trace_bytes.decode().splitlines():
            raw = json.loads(line)
            event = trace_event(raw)
            if event:
                add({**event, "recorded_at": raw.get("ts")})
            if raw.get("event") == "tool_result":
                action = next((a for a in actions if a["tool"] == raw["tool"]), None)
                if action:
                    actions.remove(action)
                    if action["tool_class"] == "write" and action["status"] == "completed":
                        add(effect_event(action["tool"], action["input"], action.get("result")))
        add(status_event(state))
        for withheld in state.get("withheld_actions", []):
            add({"t": "withheld", "reason": withheld, "source": "agent decision; not a gate invocation"})
        add({"t": "episode_end", "reason": "Recorded decision complete. This is one decision, not a full repair lifecycle.",
             "summary": summary_of(events), "verdict": None})
        dest = output / f"{scenario['id']}.jsonl"
        dest.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n")
        catalog.append({**scenario, "property": spec["metadata"]["property_hint"], "replay": f"/replays/{dest.name}", "events": len(events), "provenance": provenance})
        print(f"{dest.name}: {len(events)} events, {dest.stat().st_size} bytes, real {spec['id']} recording")
    world = yaml.safe_load((root / "mockworld/data/world.yaml").read_text())
    props = []
    for p in world["properties"]:
        t = next(t for t in world["tenancies"] if t["property_id"] == p["id"])
        props.append({k: p[k] for k in ("id", "address", "type", "landlord_id")} | {"tenant": t["tenant_name"], "occupants": t["occupants"], "vulnerable": p["id"] == "P-005"})
    public_world = {"properties": props,
        "landlords": [{k: landlord[k] for k in ("id", "name", "spend_cap_gbp", "always_ask")} for landlord in world["landlords"]],
        "contractors": [{k: c[k] for k in ("id", "name", "trade")} for c in world["contractors"]],
        "operators": ["Workflow operator", "Property manager", "Finance desk", "Safeguarding desk"]}
    (output.parent / "catalog.json").write_text(json.dumps({"scenarios": catalog, "world": public_world}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("agent_root", type=Path)
    parser.add_argument("--output", type=Path, default=Path("demo/web/replays"))
    parser.add_argument("--recordings-root", type=Path, help="Directory containing F01/F02/F07/F08 recording artifacts")
    args = parser.parse_args()
    try:
        convert(args.agent_root, args.output, args.recordings_root)
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
