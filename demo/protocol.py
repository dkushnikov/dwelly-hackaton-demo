"""Versioned presentation events. Never promote an attempted write to an effect."""

import re

STAGES = [
    "intake", "landlord_approval", "provider_selection", "visit_scheduling",
    "quote_approval", "work_in_progress", "result", "final_checks", "closed",
]
ROLES = ("tenant", "landlord", "contractor", "operator")


def owner_of(state):
    hold = str(state.get("hold_reason", "")).lower()
    for words, role in [(('landlord',), 'landlord'), (('provider', 'contractor'), 'contractor'),
                        (('tenant',), 'tenant')]:
        if any(word in hold for word in words):
            return role
    if state.get("disposition") == "escalated":
        return "operator"
    step = str(state.get("next_step", "")).lower()
    # Use the subject, not somebody mentioned later in the sentence.
    match = re.match(r"\s*(tenant|landlord|contractor|provider|operator|property.manager)\b", step)
    if match:
        return {"provider": "contractor", "property manager": "operator", "property_manager": "operator"}.get(match[1], match[1])
    return "agency"


def status_event(state):
    return dict(
        t="status", stage=state.get("stage") or "unknown", hold_reason=state.get("hold_reason", ""),
        owner=owner_of(state), recap=state.get("recap") or state.get("decision", ""),
        next_step=state.get("next_step", ""), dod=state.get("definition_of_done", []),
        red_flags=state.get("red_flags", []), handover=state.get("handover"),
        disposition=state.get("disposition"), urgency=state.get("urgency", "unknown"),
        withheld_actions=state.get("withheld_actions", []),
        usage={"input": state.get("input_tokens", 0), "output": state.get("output_tokens", 0)},
    )


def trace_event(trace):
    kind = trace.get("event")
    if kind == "model_turn":
        return {"t": "agent_thinking", "step": trace.get("step", 0), "usage": trace.get("usage", {})}
    if kind in ("gate", "playbook", "tool_result", "terminal", "nudge", "reconciled", "time_nudge"):
        return {"t": kind, **{k: v for k, v in trace.items() if k not in ("event", "ts")}}
    return None


def effect_event(op, inputs, result=None):
    role = {"notify_tenant": "tenant", "notify_landlord": "landlord", "notify_contractor": "contractor",
            "request_landlord_approval": "landlord", "create_work_order": "contractor",
            "schedule_access": "tenant", "create_human_task": "operator"}.get(op, "agency")
    summary = next((str(inputs[k]) for k in ("message", "description", "subject", "title", "note", "window") if inputs.get(k)), op.replace("_", " "))
    return {"t": "effect", "op": op, "to_role": role, "summary": summary,
            "input": inputs, "result": result, "property": inputs.get("property_id"),
            "deduplicated": isinstance(result, dict) and result.get("deduplicated") is True}


def summary_of(events):
    gates = [e for e in events if e.get("t") == "gate" and e.get("reason") != "read"]
    statuses = [e for e in events if e.get("t") == "status"]
    state = statuses[-1] if statuses else {}
    return {
        "stage": state.get("stage", "unknown"),
        "allowed": sum(e.get("verdict") == "allow" for e in gates),
        "approvals": sum(e.get("t") == "effect" and e.get("op") == "request_landlord_approval" for e in events),
        "blocked": sum(e.get("verdict") in ("deny", "escalate") for e in gates),
        "withheld": len(state.get("withheld_actions", [])),
        "done": sum(d.get("status") == "done" for d in state.get("dod", [])),
        "total": len(state.get("dod", [])),
    }
