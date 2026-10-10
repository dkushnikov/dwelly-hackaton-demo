"""Build a source-linked public-case ledger and a separate deterministic BI fixture.

Reads only the public index and the already bundled village catalog. No model call,
PDF extraction, secrets, actor matching by name or sibling-repository mutation.
"""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "demo/web"


def public_ledger(raw):
    cases = json.loads(raw)
    jobs = []
    seen = set()
    for position, case in enumerate(cases):
        cid = f"PM-{case['number']:03d}"
        if cid in seen:
            raise ValueError(f"Duplicate case: {cid}")
        seen.add(cid)
        ref = f"pm-cases-index.json#/{position}"
        event_ref = lambda n, cid=cid: f"{cid}/ev{n:03d}"  # noqa: E731
        interventions = [{"kind": i["kind"], "source_id": event_ref(i["event"]), "text": i["what"]}
                         for i in case["human_interventions"]]
        money = [{"amount_gbp": m["amount_gbp"], "raw": m["raw"], "text": m["context"],
                  "source_id": event_ref(m["event"]), "classification": "unverified_mention"} for m in case["money"]]
        updates = [{"source_id": event_ref(int(s.split(":", 1)[0])), "value": s.split(":", 1)[1]}
                   for s in case["update_sequence"]]
        closure_refs = [u["source_id"] for u in updates if u["value"] == case["closure"]]
        jobs.append({
            "case_id": cid, "title": case["title"], "case_type": case["case_type"],
            "opened": case["created"], "closed": case["completed"], "duration_days": case["duration_days"],
            "event_count": case["n_events"], "closure": case["closure"], "closure_refs": closure_refs or [ref + "/closure"],
            "hold_reasons": case["hold_reasons"], "interventions": interventions, "money_mentions": money,
            "updates": updates, "attachment_names": case["attachment_names"], "outcome": case["outcome_summary"],
            "source_ids": [ref], "history_ref": f"Property Management/{case['number']:03d}/history.md",
            "property_id": None, "landlord_id": None, "tenancy_id": None, "contractor_id": None,
            "invoice": None, "accepted_quote": None, "rework": None, "landlord_wait_days": None,
        })
    return {"v": 1, "kind": "public_corpus", "title": "Public case corpus", "synthetic": True,
            "source": "lettings-ops-agent/data/pm-cases-index.json", "sha256": hashlib.sha256(raw).hexdigest(),
            "description": "50 synthetic public cases. Dates are corpus dates, including future dates. Names cannot be joined across cases.",
            "jobs": jobs}


def portfolio_fixture(catalog):
    jobs = []
    base = {"plumber": 120, "gas_safe": 195, "electrician": 145, "heating": 210, "locksmith": 85, "general": 170}
    for cidx, contractor in enumerate(catalog["world"]["contractors"]):
        for month in range(1, 13):
            cid = f"LAB-{contractor['id']}-{month:02d}"
            prop = catalog["world"]["properties"][(month + cidx) % 6]
            overrun = contractor["id"] == "C-007"
            quote = base[contractor["trade"]] + ((month * 7 + cidx * 3) % 5 - 2) * 5
            invoice = round(quote * (1.65 if overrun else 1 + (month % 3 - 1) * .02), 2)
            interventions = [{"kind": "review_prompt", "source_id": f"{cid}/review", "text": "Simulated staff review."}]
            if overrun:
                interventions += [{"kind": "staff_call", "source_id": f"{cid}/chase-{n}",
                                   "text": "Simulated provider chase."} for n in range(3)]
            jobs.append({
                "case_id": cid, "title": f"Simulated {contractor['trade']} repair · {prop['id']}",
                "case_type": contractor["trade"], "postcode_area": "TW", "property_id": prop["id"],
                "landlord_id": prop["landlord_id"], "tenancy_id": None, "contractor_id": contractor["id"],
                "contractor_name": contractor["name"], "opened": f"2025-{month:02d}-03", "closed": f"2025-{month:02d}-15",
                "duration_days": 12, "closure": "CLOSED_ALL_CHECKS", "closure_refs": [f"{cid}/completion"],
                "source_ids": [f"{cid}/fixture"], "event_count": None, "hold_reasons": {},
                "interventions": interventions, "money_mentions": [], "updates": [], "attachment_names": [],
                "outcome": "Synthetic completed job. Not an agent execution or an observed contractor result.",
                "invoice": {"amount_gbp": invoice, "vat": "included", "source_ids": [f"{cid}/invoice"]},
                "accepted_quote": {"amount_gbp": quote, "vat": "included", "source_ids": [f"{cid}/approval"]},
                "landlord_wait_days": 5 if prop["landlord_id"] == "L-002" else 1,
                "wait_source_ids": [f"{cid}/approval-wait"],
                "rework": overrun and month % 3 == 0, "rework_source_ids": [f"{cid}/follow-up-90d"],
            })
    digest = hashlib.sha256(json.dumps(jobs, sort_keys=True).encode()).hexdigest()
    return {"v": 1, "kind": "portfolio_lab", "title": "Portfolio lab", "synthetic": True,
            "source": "scripts/import_insights.py:portfolio_fixture (deterministic v1)", "sha256": digest,
            "description": "84 invented closed jobs, 2025. Scenario fixture only: contractor performance is invented. No agency agent or model generated these outcomes.",
            "jobs": jobs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("agent_root", type=Path)
    args = parser.parse_args()
    public = public_ledger((args.agent_root / "data/pm-cases-index.json").read_bytes())
    lab = portfolio_fixture(json.loads((WEB / "catalog.json").read_text()))
    for name, data in [("insights-corpus.json", public), ("insights-lab.json", lab)]:
        (WEB / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print(f"{name}: {len(data['jobs'])} jobs · {data['kind']} · SHA-256 {data['sha256']}")


if __name__ == "__main__":
    main()
