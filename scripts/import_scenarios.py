"""Bundle selected public-case evidence for the explicitly simulated story library."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "demo/web"
SELECTION = [
    (21, "public-keys", "P-001", "keys", [1, 6, 20, 25, 28, 29]),
    (17, "public-fan", "P-002", "fan", [1, 8, 11, 14]),
    (25, "public-warranty", "P-006", "warranty", [1, 6, 20, 22, 42, 44, 50, 62, 64]),
]


def build(root):
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    result = []
    for number, sid, prop, kind, selected in SELECTION:
        directory = root / "Property Management" / f"{number:03}"
        index, history = (directory / "index.md").read_bytes(), (directory / "history.md").read_bytes()
        text = index.decode()
        section = lambda name, text=text: text.split(f"## {name}\n", 1)[1].split("\n## ", 1)[0].strip()  # noqa: E731
        events = dict(re.findall(r'<a id="event-(\d+)"></a>\s*(.*?)(?=<a id="event-|\Z)', history.decode(), re.S))
        case_id = f"PM-{number:03}"
        base = f"https://github.com/DwellyOrg/HackatonPublicCases/blob/{revision}/Property%20Management/{number:03}"
        result.append({"id": sid, "title": text.splitlines()[0].split(": ", 1)[1], "property": prop,
            "kind": kind, "tag": f"Public case · {case_id}", "color": "sage",
            "issue": section("Initial request"), "description": section("Outcome"),
            "source": {"case": case_id, "track": "Property Management", "url": base + "/index.md",
                "history_url": base + "/history.md", "revision": revision,
                "index_sha256": hashlib.sha256(index).hexdigest(), "history_sha256": hashlib.sha256(history).hexdigest(),
                "original_property": re.search(r"\*\*Property:\*\* (.+)", text)[1],
                "adaptation": "Public synthetic case adapted to village residents. Turns, dialogue and timing are simulated; this is not an LLM evaluation.",
                "caveat": "The source has conflicting appointment dates. The simulation uses relative time without reconciling those dates." if kind == "warranty" else "Names and the property are mapped to the village; closure checks retain the public case's meaning.",
                "evidence": [{"id": f"{case_id}/ev{n:03}", "url": base + f"/history.md#event-{n:03}", "text": events[f"{n:03}"]} for n in selected]}})
    return {"v": 1, "scenarios": result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("public_root", type=Path)
    args = parser.parse_args()
    output = WEB / "public-scenarios.json"
    output.write_text(json.dumps(build(args.public_root), indent=2, ensure_ascii=False) + "\n")
    print(f"{output.name}: 3 public cases with source revision, hashes and event evidence")
