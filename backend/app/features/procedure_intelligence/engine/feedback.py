"""
Generates specific, explainable real-time feedback for procedure coaching.

Rules:
- Feedback must be specific and only shown for reliable measurements.
  e.g. "Index PIP angle is 18° above the target range."
- Show ONE correction at a time (the largest deviation).
- If measurements are unavailable, guide the learner to keep their hand in view.
"""

from __future__ import annotations

from app.features.procedure_intelligence.engine.rules import ValidationResult
from app.features.procedure_intelligence.engine.state_machine import StepUpdate
from app.features.realtime_feedback.schemas.response import FeedbackItem

_METRIC_LABELS: dict[str, str] = {
    "index_mcp_angle": "Index MCP angle",
    "mcp_joint": "Index MCP angle",
    "index_pip_angle": "Index PIP angle",
    "pip_joint": "Index PIP angle",
    "index_dip_angle": "Index DIP angle",
    "wrist_index_angle": "Wrist-index angle",
    "thumb_index_angle": "Thumb-index spread",
    "index_middle_alignment": "Index-middle alignment",
    "thumb_index_distance": "Thumb-index pinch distance",
    "thumb_index_over_palm": "Thumb-index pinch distance",
    "index_middle_distance": "Index-middle distance",
    "index_middle_over_palm": "Index-middle distance",
    "middle_below_index": "Middle finger support position",
}


def _format_violation_feedback(violation: dict) -> FeedbackItem:
    key = str(violation.get("constraint_key") or "measurement")
    label = _METRIC_LABELS.get(key, key.replace("_", " ").title())
    dev = float(violation.get("deviation_amount", 0.0))
    direction = str(violation.get("direction", "above"))

    is_angle = "angle" in key or "joint" in key or "alignment" in key

    if is_angle:
        dev_str = f"{int(round(abs(dev)))}°"
        msg = f"{label} is {dev_str} {direction} the target range."
    else:
        # Distance or scalar
        if "thumb_index" in key and direction == "above":
            msg = f"{label} is too wide. Bring your thumb and index finger closer."
        elif "thumb_index" in key and direction == "below":
            msg = f"{label} is too tight. Open your thumb and index pinch slightly."
        elif "index_middle" in key:
            msg = f"Move your middle finger closer to your index finger for support."
        else:
            msg = f"{label} is {direction} target range."

    return FeedbackItem(
        code=f"{key.upper()}_VIOLATION",
        message=msg,
        severity="warning",
    )


def generate_feedback(
    *,
    validation: ValidationResult,
    step_update: StepUpdate,
    detection_state: str = "hand_detected",
) -> list[FeedbackItem]:
    """Generate explainable coaching feedback.

    Priorities:
    1. If tracking is lost or partial, report tracking state.
    2. If constraints are invalid, show ONE specific correction (the largest deviation).
    3. If measurements are unavailable, prompt learner to place full hand in view.
    4. If constraints are valid and dwell hold is active, show remaining hold duration.
    5. If step completed, congratulate and announce next phase.
    """
    if detection_state == "no_hand":
        return [
            FeedbackItem(
                code="NO_HAND",
                message="No hand detected. Position your hand inside the camera frame.",
                severity="warning",
            )
        ]

    if detection_state == "partial_or_unreliable":
        return [
            FeedbackItem(
                code="PARTIAL_HAND",
                message="Hand partially visible. Ensure all 5 fingers and wrist are in view.",
                severity="warning",
            )
        ]

    if not validation.valid:
        if validation.violations:
            # Violations are pre-sorted by deviation_amount in rules.py
            primary = validation.violations[0]
            return [_format_violation_feedback(primary)]

        if validation.unavailable:
            missing_labels = [
                _METRIC_LABELS.get(k, k) for k in validation.unavailable[:2]
            ]
            return [
                FeedbackItem(
                    code="MEASUREMENT_UNAVAILABLE",
                    message=f"Measurement unavailable for {', '.join(missing_labels)}. Keep hand steady in view.",
                    severity="warning",
                )
            ]

        return [
            FeedbackItem(
                code="CONSTRAINT_INVALID",
                message="Adjust your hand position to match the target range.",
                severity="warning",
            )
        ]

    if int(step_update.dwell_remaining_ms) > 0:
        rem_sec = round(max(0.1, int(step_update.dwell_remaining_ms) / 1000.0), 1)
        return [
            FeedbackItem(
                code="DWELL_REMAINING",
                message=f"Synced! Hold position steady for {rem_sec} second(s)...",
                severity="info",
            )
        ]

    if step_update.advanced and step_update.step_now != step_update.step_started:
        return [
            FeedbackItem(
                code="STEP_COMPLETE",
                message="Synced! Step complete, moving to the next position.",
                severity="info",
            )
        ]

    return [
        FeedbackItem(
            code="OK",
            message="Optimal posture. Technique confirmed.",
            severity="info",
        )
    ]
