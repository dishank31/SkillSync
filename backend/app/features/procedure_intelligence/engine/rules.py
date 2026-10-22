"""
Constraint evaluation for procedure steps.

Key change from prior version: missing measurements (``None``)
are **not** defaulted to 0. A ``None`` value means the measurement
is unavailable — the constraint is recorded in ``unavailable``
and causes ``valid = False`` (never mistaken for a valid 0-degree angle).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.features.procedure_intelligence.engine.schema import StepConstraints, StepSchema

DISTANCE_KEY_ALIASES: dict[str, str] = {
    "grip_distance": "thumb_index_distance",
    "thumb_index_over_palm": "thumb_index_distance",
    "index_middle_over_palm": "index_middle_distance",
}


def _expand_distance_keys(distances: dict[str, Optional[float]]) -> dict[str, Optional[float]]:
    """Ensure both canonical names and aliases exist in the lookup dict."""
    expanded = dict(distances)
    for alias, canonical in DISTANCE_KEY_ALIASES.items():
        if canonical in distances and distances[canonical] is not None and alias not in expanded:
            expanded[alias] = distances[canonical]
        elif alias in distances and distances[alias] is not None and canonical not in expanded:
            expanded[canonical] = distances[alias]
    return expanded


@dataclass(frozen=True)
class ValidationResult:
    """Result of evaluating step constraints.

    Attributes:
        valid: True only when *every* required constraint is satisfied
            and none have unavailable measurements.
        violations: List of constraint violations with deviation info.
        unavailable: List of constraint keys that could not be
            evaluated because the measurement was ``None``.
    """

    valid: bool
    violations: list[dict]
    unavailable: list[str]


def evaluate_constraints(
    *,
    constraints: StepConstraints,
    angles: dict[str, Optional[float]],
    distances: dict[str, Optional[float]],
    scalars: dict[str, Optional[float]] | None = None,
) -> ValidationResult:
    """Evaluate step constraints, propagating None as *unavailable*.

    A constraint whose measured value is ``None`` is recorded in
    ``unavailable`` and causes ``valid = False``.
    """
    expanded_distances = _expand_distance_keys(distances)
    scalar_values: dict[str, Optional[float]] = scalars or {}
    violations: list[dict] = []
    unavailable: list[str] = []

    for key, c in (constraints.angles or {}).items():
        actual = angles.get(key)
        # Check alias if not found (e.g. mcp_joint vs index_mcp_angle)
        if actual is None and key == "mcp_joint":
            actual = angles.get("index_mcp_angle")
        elif actual is None and key == "pip_joint":
            actual = angles.get("index_pip_angle")

        if actual is None:
            unavailable.append(key)
            continue

        actual_f = float(actual)
        if actual_f < c.min:
            violations.append({
                "constraint_key": key,
                "expected": {"min": float(c.min), "max": float(c.max)},
                "actual": actual_f,
                "deviation_amount": float(c.min - actual_f),
                "direction": "below",
            })
        elif actual_f > c.max:
            violations.append({
                "constraint_key": key,
                "expected": {"min": float(c.min), "max": float(c.max)},
                "actual": actual_f,
                "deviation_amount": float(actual_f - c.max),
                "direction": "above",
            })

    for key, c in (constraints.distances or {}).items():
        actual = expanded_distances.get(key)
        if actual is None:
            unavailable.append(key)
            continue

        actual_f = float(actual)
        if c.min is not None and actual_f < float(c.min):
            violations.append({
                "constraint_key": key,
                "expected": {
                    **({} if c.min is None else {"min": float(c.min)}),
                    **({} if c.max is None else {"max": float(c.max)}),
                },
                "actual": actual_f,
                "deviation_amount": float(float(c.min) - actual_f),
                "direction": "below",
            })
        elif c.max is not None and actual_f > float(c.max):
            violations.append({
                "constraint_key": key,
                "expected": {
                    **({} if c.min is None else {"min": float(c.min)}),
                    **({} if c.max is None else {"max": float(c.max)}),
                },
                "actual": actual_f,
                "deviation_amount": float(actual_f - float(c.max)),
                "direction": "above",
            })

    for key, c in (constraints.scalars or {}).items():
        actual = scalar_values.get(key)
        if actual is None:
            unavailable.append(key)
            continue

        actual_f = float(actual)
        if c.min is not None and actual_f < float(c.min):
            violations.append({
                "constraint_key": key,
                "expected": {
                    **({} if c.min is None else {"min": float(c.min)}),
                    **({} if c.max is None else {"max": float(c.max)}),
                },
                "actual": actual_f,
                "deviation_amount": float(float(c.min) - actual_f),
                "direction": "below",
            })
        elif c.max is not None and actual_f > float(c.max):
            violations.append({
                "constraint_key": key,
                "expected": {
                    **({} if c.min is None else {"min": float(c.min)}),
                    **({} if c.max is None else {"max": float(c.max)}),
                },
                "actual": actual_f,
                "deviation_amount": float(actual_f - float(c.max)),
                "direction": "above",
            })

    # Violations sorted with largest deviation first
    violations.sort(key=lambda v: abs(float(v.get("deviation_amount", 0.0))), reverse=True)
    is_valid = len(violations) == 0 and len(unavailable) == 0

    return ValidationResult(valid=is_valid, violations=violations, unavailable=unavailable)


def validate_step(
    *,
    step: StepSchema,
    angles: dict[str, Optional[float]],
    distances: dict[str, Optional[float]],
    scalars: dict[str, Optional[float]] | None = None,
) -> ValidationResult:
    return evaluate_constraints(
        constraints=step.constraints,
        angles=angles,
        distances=distances,
        scalars=scalars,
    )
