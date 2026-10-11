"""Create a portable static replay build without bundling live sessions or credentials."""

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "demo/web"
FILES = ["index.html", "style.css", "app.js", "model.js", "case-view.js", "village.js", "sw.js", "favicon.svg", "catalog.json", "simulation.js", "workspace.js", "public-scenarios.json"]
FILES += ["insights.css", "insights.js", "insights-model.js", "insights-rules.json", "insights-corpus.json", "insights-lab.json"]


def main():
    dest = ROOT / "dist"
    dest.mkdir(exist_ok=True)
    for name in FILES:
        shutil.copyfile(WEB / name, dest / name)
    (dest / "replays").mkdir(exist_ok=True)
    for name in ["routine", "approval", "fraud", "vulnerable"]:
        source = WEB / "replays" / f"{name}.jsonl"
        events = [json.loads(line) for line in source.read_text().splitlines()]
        if not events or events[0]["v"] != 1 or events[-1]["t"] != "episode_end":
            raise ValueError(f"Invalid bundled replay: {name}")
        shutil.copyfile(source, dest / "replays" / source.name)
    shutil.copyfile(ROOT / "deploy/static-headers", dest / "_headers")
    shutil.copyfile(ROOT / "NOTICE", dest / "NOTICE.txt")
    shutil.copyfile(ROOT / "LICENSE", dest / "LICENSE.txt")
    shutil.copyfile(ROOT / "LICENSE-THIRD-PARTY", dest / "LICENSE-THIRD-PARTY.txt")
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    archive = artifacts / "lettings-village-static.zip"
    members = FILES + [f"replays/{name}.jsonl" for name in ("routine", "approval", "fraud", "vulnerable")]
    members += ["_headers", "NOTICE.txt", "LICENSE.txt", "LICENSE-THIRD-PARTY.txt"]
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in members:
            bundle.write(dest / name, name)
    print(f"Static replay build: {dest}")
    print("4 authentic recordings; no runtime sessions, agent source, credentials, CDN or API dependency.")
    print("Interactive simulation: 3 source-linked public cases, role control and browser-local saved sessions; no API calls.")
    print("BI: 50 public corpus cases + 84 clearly labelled synthetic portfolio jobs; local review feedback.")
    print(f"Deployment archive: {archive} ({archive.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
