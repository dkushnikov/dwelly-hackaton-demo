import json
from pathlib import Path

from scripts.import_insights import portfolio_fixture, public_ledger

ROOT = Path(__file__).resolve().parents[1]


def test_fixture_is_reproducible_and_explicitly_synthetic():
    catalog = json.loads((ROOT / "demo/web/catalog.json").read_text())
    a, b = portfolio_fixture(catalog), portfolio_fixture(catalog)
    assert a == b
    assert a["synthetic"] and a["kind"] == "portfolio_lab"
    assert len(a["jobs"]) == len({j["case_id"] for j in a["jobs"]}) == 84
    assert all(j["invoice"]["source_ids"] and j["tenancy_id"] is None for j in a["jobs"])


def test_public_import_keeps_event_refs_and_does_not_invent_financial_or_actor_facts():
    case = {"number": 1, "title": "Repair", "case_type": "plumbing", "created": "2025-01-01",
            "completed": "2025-01-02", "duration_days": 1, "n_events": 3, "closure": "CLOSED_ALL_CHECKS",
            "hold_reasons": {}, "attachment_names": [], "outcome_summary": "Done",
            "human_interventions": [{"event": 1, "kind": "staff_note", "what": "£100 quoted"}],
            "money": [{"event": 1, "amount_gbp": 100, "raw": "£100", "context": "Quoted"}],
            "update_sequence": ["003:CLOSED_ALL_CHECKS"]}
    data = public_ledger(json.dumps([case]).encode())
    job = data["jobs"][0]
    assert job["invoice"] is None and job["contractor_id"] is None and job["property_id"] is None
    assert job["money_mentions"][0]["source_id"] == "PM-001/ev001"
    assert job["closure_refs"] == ["PM-001/ev003"]
