"""
Procedure schema definitions and constraint limits.

The product focuses on simulated soldering practice (approach, positioning,
hold phases) on a fixed work area. Visual hand technique coaching only.
A webcam cannot verify heat, solder flow, electrical connection, or joint metallurgy.
"""

from __future__ import annotations

import copy
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AngleConstraint(BaseModel):
    min: float = Field(..., description="Minimum allowed angle value (inclusive).")
    max: float = Field(..., description="Maximum allowed angle value (inclusive).")


class DistanceConstraint(BaseModel):
    min: float | None = Field(
        None,
        description="Minimum allowed distance value (inclusive).",
    )
    max: float | None = Field(
        None,
        description="Maximum allowed distance value (inclusive).",
    )

    @model_validator(mode="after")
    def _require_min_or_max(self) -> "DistanceConstraint":
        if self.min is None and self.max is None:
            raise ValueError("At least one of 'min' or 'max' must be provided.")
        return self


class ScalarConstraint(BaseModel):
    min: float | None = Field(
        None,
        description="Minimum allowed scalar value (inclusive).",
    )
    max: float | None = Field(
        None,
        description="Maximum allowed scalar value (inclusive).",
    )

    @model_validator(mode="after")
    def _require_min_or_max(self) -> "ScalarConstraint":
        if self.min is None and self.max is None:
            raise ValueError("At least one of 'min' or 'max' must be provided.")
        return self


class StepConstraints(BaseModel):
    angles: dict[str, AngleConstraint] = Field(default_factory=dict)
    distances: dict[str, DistanceConstraint] = Field(default_factory=dict)
    scalars: dict[str, ScalarConstraint] = Field(default_factory=dict)


class StepSchema(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    method: str | None = None
    feedback: dict[str, str] = Field(default_factory=dict)
    constraints: StepConstraints = Field(default_factory=StepConstraints)
    dwell_time_ms: int = Field(0, ge=0)
    next_step: str


class ProcedureSchema(BaseModel):
    procedure_id: str
    steps: list[StepSchema]

    def step_by_id(self) -> dict[str, StepSchema]:
        return {s.id: s for s in self.steps}


PROCEDURES: dict[str, dict[str, Any]] = {
    # ── Simulated Soldering Practice (Approach, Positioning, Hold phases) ──
    "soldering_practice": {
        "procedure_id": "soldering_practice",
        "steps": [
            {
                "id": "approach_phase",
                "name": "Approach Phase",
                "description": "Enter work area with controlled iron angle.",
                "method": "Hold iron in three-point pencil grip; angle tool toward joint (40°–65°).",
                "feedback": {
                    "correct": "Good approach angle. Ready to position tip.",
                    "incorrect": "Adjust tool approach angle to enter the joint smoothly.",
                },
                "constraints": {
                    "angles": {
                        "wrist_index_angle": {"min": 40.0, "max": 75.0},
                        "index_mcp_angle": {"min": 70.0, "max": 170.0},
                    },
                    "distances": {
                        "thumb_index_distance": {"min": 0.0, "max": 0.45},
                    },
                },
                "dwell_time_ms": 2000,
                "next_step": "positioning_phase",
            },
            {
                "id": "positioning_phase",
                "name": "Positioning Phase",
                "description": "Form precision tripod grip and rest heel of hand.",
                "method": "Stabilize index PIP joint flexion and align tip to pad.",
                "feedback": {
                    "correct": "Iron position stable and aligned to pad.",
                    "incorrect": "Adjust finger flexion to maintain firm iron control.",
                },
                "constraints": {
                    "angles": {
                        "index_pip_angle": {"min": 85.0, "max": 140.0},
                        "wrist_index_angle": {"min": 35.0, "max": 60.0},
                    },
                    "distances": {
                        "thumb_index_distance": {"min": 0.05, "max": 0.40},
                    },
                },
                "dwell_time_ms": 2500,
                "next_step": "hold_phase",
            },
            {
                "id": "hold_phase",
                "name": "Hold Phase (Joint Dwell)",
                "description": "Maintain steady contact without tremor.",
                "method": "Keep hand motionless during simulated thermal transfer.",
                "feedback": {
                    "correct": "Perfect stillness maintained throughout dwell.",
                    "incorrect": "Hold completely steady; minimize hand tremble.",
                },
                "constraints": {
                    "angles": {
                        "wrist_index_angle": {"min": 35.0, "max": 65.0},
                        "index_pip_angle": {"min": 90.0, "max": 145.0},
                        "index_mcp_angle": {"min": 70.0, "max": 165.0},
                    },
                    "distances": {
                        "thumb_index_distance": {"min": 0.05, "max": 0.35},
                    },
                },
                "dwell_time_ms": 3000,
                "next_step": "completed",
            },
            {
                "id": "completed",
                "name": "Completed",
                "description": "Soldering technique procedure complete.",
                "constraints": {"angles": {}, "distances": {}, "scalars": {}},
                "dwell_time_ms": 0,
                "next_step": "completed",
            },
        ],
    },

    # ── Backward-compatible surgical knot tying procedure ──
    "surgical_knot_tying": {
        "procedure_id": "surgical_knot_tying",
        "steps": [
            {
                "id": "thumb_index_precision_grip",
                "name": "Thumb-Index Precision Grip",
                "description": "Keep your thumb and index finger close together.",
                "method": "Hold your thumb and index finger in a tight, controlled pinch.",
                "feedback": {
                    "correct": "Great start. Your pinch grip looks good.",
                    "incorrect": "Bring your thumb and index finger a little closer.",
                },
                "constraints": {
                    "distances": {"thumb_index_over_palm": {"min": 0.0, "max": 0.35}},
                },
                "dwell_time_ms": 2000,
                "next_step": "middle_finger_support",
            },
            {
                "id": "middle_finger_support",
                "name": "Middle Finger Support",
                "description": "Use your middle finger to support the grip.",
                "method": "Keep the middle finger close to the index finger and use it for support.",
                "feedback": {
                    "correct": "Nice. Your middle finger support is in place.",
                    "incorrect": "Move your middle finger closer to support the grip.",
                },
                "constraints": {
                    "distances": {"index_middle_over_palm": {"max": 0.6}},
                    "angles": {"index_middle_alignment": {"min": 0.0, "max": 75.0}},
                    "scalars": {"middle_below_index": {"min": 0.0, "max": 5.0}},
                },
                "dwell_time_ms": 2000,
                "next_step": "initial_incision_position",
            },
            {
                "id": "initial_incision_position",
                "name": "Initial Incision Position",
                "description": "Start with the tool mostly upright.",
                "method": "Raise your hand position so the tool is near vertical.",
                "feedback": {
                    "correct": "Good position. You are close to upright.",
                    "incorrect": "Tilt the tool up a bit more toward vertical.",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 70.0, "max": 110.0}},
                },
                "dwell_time_ms": 2000,
                "next_step": "cutting_angle_control",
            },
            {
                "id": "cutting_angle_control",
                "name": "Cutting Angle Control",
                "description": "Lower the tool to a comfortable cutting angle.",
                "method": "Keep the tool at a steady angled position while moving.",
                "feedback": {
                    "correct": "Great. Your cutting angle looks stable.",
                    "incorrect": "Adjust your wrist slightly to find a steady angle.",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 30.0, "max": 45.0}},
                },
                "dwell_time_ms": 2000,
                "next_step": "grip_stability",
            },
            {
                "id": "grip_stability",
                "name": "Grip Stability",
                "description": "Hold the same clean grip without shaking.",
                "method": "Keep your hand steady for the full hold time.",
                "feedback": {
                    "correct": "Excellent. You held the grip steadily.",
                    "incorrect": "Stay still and hold this position a little longer.",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 30.0, "max": 45.0}},
                    "distances": {
                        "thumb_index_over_palm": {"min": 0.0, "max": 0.35},
                        "index_middle_over_palm": {"max": 0.6},
                    },
                    "scalars": {"middle_below_index": {"min": 0.0, "max": 5.0}},
                },
                "dwell_time_ms": 2000,
                "next_step": "completed",
            },
            {
                "id": "completed",
                "name": "Completed",
                "description": "Procedure completed successfully.",
                "constraints": {"angles": {}, "distances": {}, "scalars": {}},
                "dwell_time_ms": 0,
                "next_step": "completed",
            },
        ],
    },
}

DIFFICULTY_OVERRIDES: dict[str, dict[str, dict[str, dict[str, dict[str, float]]]]] = {
    "beginner": {
        "approach_phase": {
            "angles": {
                "wrist_index_angle": {"min": 30.0, "max": 90.0},
                "index_mcp_angle": {"min": 65.0, "max": 175.0},
            },
        },
        "positioning_phase": {
            "angles": {
                "index_pip_angle": {"min": 75.0, "max": 150.0},
                "wrist_index_angle": {"min": 30.0, "max": 85.0},
            },
        },
        "hold_phase": {
            "angles": {
                "wrist_index_angle": {"min": 30.0, "max": 75.0},
                "index_mcp_angle": {"min": 65.0, "max": 175.0},
            },
        },
        "initial_incision_position": {
            "angles": {"wrist_index_angle": {"min": 60.0, "max": 120.0}},
        },
        "cutting_angle_control": {
            "angles": {"wrist_index_angle": {"min": 30.0, "max": 60.0}},
        },
        "grip_stability": {
            "angles": {"wrist_index_angle": {"min": 30.0, "max": 60.0}},
        },
    },
}


def _apply_difficulty_overrides(
    raw: dict[str, Any],
    difficulty: str,
) -> dict[str, Any]:
    overrides = DIFFICULTY_OVERRIDES.get(difficulty)
    if not overrides:
        return raw

    patched = copy.deepcopy(raw)
    for step in patched.get("steps", []):
        step_overrides = overrides.get(step["id"])
        if not step_overrides:
            continue
        constraints = step.setdefault("constraints", {})
        for category, entries in step_overrides.items():
            cat_dict = constraints.setdefault(category, {})
            for key, values in entries.items():
                cat_dict[key] = {**cat_dict.get(key, {}), **values}
    return patched


LoadSchemaErrorCode = Literal["unknown_procedure_id"]


class LoadSchemaError(ValueError):
    def __init__(self, code: LoadSchemaErrorCode, message: str):
        super().__init__(message)
        self.code = code


def load_procedure_schema(
    procedure_id: str,
    difficulty: str = "beginner",
) -> ProcedureSchema:
    raw = PROCEDURES.get(procedure_id)
    if raw is None:
        raise LoadSchemaError(
            "unknown_procedure_id",
            f"Unknown procedure_id={procedure_id!r}. Available={sorted(PROCEDURES.keys())}",
        )
    patched = _apply_difficulty_overrides(raw, difficulty)
    return ProcedureSchema.model_validate(patched)
