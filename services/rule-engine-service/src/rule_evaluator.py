"""
Rule Engine Service — Rule Evaluator
Applies tenant rules against validated events to determine severity.
"""
from __future__ import annotations

import operator
from typing import Any

# Supported comparison operators
_OPS: dict[str, Any] = {
    "eq":  operator.eq,
    "ne":  operator.ne,
    "gt":  operator.gt,
    "gte": operator.ge,
    "lt":  operator.lt,
    "lte": operator.le,
    "in":  lambda a, b: a in b,
    "nin": lambda a, b: a not in b,
    "contains": lambda a, b: str(b).lower() in str(a).lower(),
}

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _get_value(event: dict[str, Any], field: str) -> Any:
    """
    Retrieve a field from the event using dot notation.
    e.g. "payload.zone" → event["payload"]["zone"]
    """
    parts = field.split(".")
    val: Any = event
    for part in parts:
        if isinstance(val, dict):
            val = val.get(part)
        else:
            return None
    return val


def _evaluate_condition(event: dict[str, Any], condition: dict[str, Any]) -> bool:
    """
    Evaluate a single condition or a logical group (and/or).

    Condition formats:
      Simple:  {"field": "event_type", "operator": "eq", "value": "intrusion"}
      And:     {"and": [cond1, cond2, ...]}
      Or:      {"or":  [cond1, cond2, ...]}
    """
    if "and" in condition:
        return all(_evaluate_condition(event, c) for c in condition["and"])
    if "or" in condition:
        return any(_evaluate_condition(event, c) for c in condition["or"])

    field = condition.get("field")
    op_name = condition.get("operator", "eq")
    expected = condition.get("value")

    if not field:
        return False

    actual = _get_value(event, field)
    op_fn = _OPS.get(op_name)
    if op_fn is None:
        return False

    try:
        return bool(op_fn(actual, expected))
    except (TypeError, AttributeError):
        return False


class RuleEvaluator:
    """Evaluates a list of tenant rules against an event."""

    def evaluate(
        self,
        event: dict[str, Any],
        rules: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Apply rules sorted by priority (desc).
        Returns enrichment dict: {matched_rule, severity, actions}.
        """
        matched_rule = None
        matched_severity = None
        matched_actions: list[Any] = []

        # Sort by priority descending (higher = more important)
        sorted_rules = sorted(rules, key=lambda r: r.get("priority", 0), reverse=True)

        for rule in sorted_rules:
            if not rule.get("is_active", True):
                continue

            condition = rule.get("condition", {})
            try:
                if _evaluate_condition(event, condition):
                    rule_severity = rule.get("severity", "low")
                    # Keep highest severity among matching rules
                    if (
                        matched_severity is None
                        or SEVERITY_RANK.get(rule_severity, 0) > SEVERITY_RANK.get(matched_severity, 0)
                    ):
                        matched_rule = rule
                        matched_severity = rule_severity
                        matched_actions = rule.get("actions", [])
            except Exception:
                continue  # Don't let a bad rule crash the engine

        return {
            "matched_rule_id": str(matched_rule["id"]) if matched_rule else None,
            "matched_rule_name": matched_rule.get("name") if matched_rule else None,
            "severity": matched_severity or "low",
            "actions": matched_actions,
            "rule_matched": matched_rule is not None,
        }
