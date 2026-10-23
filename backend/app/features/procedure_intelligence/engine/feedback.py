"""
Contrastive Diagnostic NLG & Real-Time Feedback Generator (CCNLP NLP Pillar 3).

Generates concise, natural-language corrective feedback that explicitly contrasts
the trainee's verbal Think-Aloud intent (NLI entailment/contradiction) against
physical 3D joint biomechanics (signed joint angle residuals).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.features.procedure_intelligence.engine.rules import ValidationResult
from app.features.procedure_intelligence.engine.state_machine import StepUpdate
from app.features.realtime_feedback.schemas.response import FeedbackItem

_METRIC_LABELS: dict[str, str] = {
    "index_mcp_angle": "Index MCP joint",
    "mcp_joint": "Index MCP joint",
    "index_pip_angle": "Index PIP joint",
    "pip_joint": "Index PIP joint",
    "index_dip_angle": "Index DIP joint",
    "middle_pip_angle": "Middle PIP joint",
    "wrist_index_angle": "Wrist tool-approach angle",
    "wrist_flexion": "Wrist flexion angle",
    "thumb_index_angle": "Thumb-index spread",
    "index_middle_alignment": "Index-middle alignment",
    "thumb_index_distance": "Thumb-index pinch distance",
    "thumb_index_over_palm": "Thumb-index pinch distance",
    "index_middle_distance": "Index-middle distance",
    "index_middle_over_palm": "Index-middle distance",
    "middle_below_index": "Middle finger support position",
}


def generate_contrastive_nlg(
    *,
    alignment_state: str,
    nli_probabilities: Optional[Any] = None,
    joint_residuals: Optional[Dict[str, float]] = None,
    current_step_name: str = "current step",
    step_hypothesis: Optional[str] = None,
    occlusion_reconstructed: bool = False,
) -> str:
    """Generate contrastive data-to-text diagnostic sentence.

    Contrasts verbal intent against physical joint biomechanics:
    - SYNCHRONIZED_MASTERY: Perfect alignment between verbal callout and joint angles.
    - MOTOR_EXECUTION_DRIFT: Spoken callout entails step, but joint residuals exceed bounds.
    - COGNITIVE_PROTOCOL_CONTRADICTION: Pose is compliant, but spoken callout contradicts safety/protocol.
    - SEMANTIC_HESITATION_OR_OMISSION: Pose held steady, but no verbal callout provided.
    - DUAL_PATHWAY_FAILURE: Both verbal callout and joint kinematics deviate.
    """
    p_entail = getattr(nli_probabilities, "p_entailment", 0.0) if nli_probabilities else 0.0
    p_contra = getattr(nli_probabilities, "p_contradiction", 0.0) if nli_probabilities else 0.0
    p_neut = getattr(nli_probabilities, "p_neutral", 1.0) if nli_probabilities else 1.0

    entail_pct = int(round(p_entail * 100))
    contra_pct = int(round(p_contra * 100))
    neut_pct = int(round(p_neut * 100))

    # Identify largest joint deviation if any
    residuals = joint_residuals or {}
    largest_joint = None
    largest_residual = 0.0
    for j, res in residuals.items():
        if abs(res) > abs(largest_residual):
            largest_residual = res
            largest_joint = j

    joint_label = _METRIC_LABELS.get(largest_joint, (largest_joint or "finger").replace("_", " "))
    res_int = int(round(abs(largest_residual)))
    sign_str = f"+{res_int}°" if largest_residual > 0 else f"-{res_int}°"
    deviation_desc = "over-flexed" if largest_residual > 0 else "under-extended"
    corrective_action = "extend slightly" if largest_residual > 0 else "flex inward slightly"

    occl_note = " [Distal joint reconstructed via anatomical coupling]" if occlusion_reconstructed else ""

    state_str = str(alignment_state).upper()

    if "SYNCHRONIZED_MASTERY" in state_str:
        return (
            f"Verbal callout entails {current_step_name} [{entail_pct}%] with precise 3D kinematic compliance. "
            f"Maintain steady hold.{occl_note}"
        )

    if "MOTOR_EXECUTION_DRIFT" in state_str:
        if largest_joint and res_int >= 4:
            return (
                f"Verbal callout entails {current_step_name} [{entail_pct}%], but your {joint_label} is "
                f"{deviation_desc} by {sign_str}; {corrective_action} to lock target grip.{occl_note}"
            )
        return (
            f"Verbal callout entails {current_step_name} [{entail_pct}%], but motor posture drifts from target bounds. "
            f"Refine finger curvature.{occl_note}"
        )

    if "COGNITIVE_PROTOCOL_CONTRADICTION" in state_str:
        return (
            f"Hand posture is accurate, but your spoken callout contradicts the required SOP protocol "
            f"({contra_pct}% contradiction). Re-affirm the step action aloud.{occl_note}"
        )

    if "SEMANTIC_HESITATION_OR_OMISSION" in state_str:
        return (
            f"Hand posture is held steadily, but no verbal callout detected ({neut_pct}% neutral). "
            f"Verbalize your current action aloud to solidify cognitive-motor sync.{occl_note}"
        )

    # DUAL_PATHWAY_FAILURE
    if largest_joint and res_int >= 4:
        return (
            f"Both physical posture and verbal callout deviate. Adjust {joint_label} ({sign_str}) "
            f"and verbalize your step action.{occl_note}"
        )
    return (
        f"Kinematic posture and verbal callout out of alignment. Review the step instructions "
        f"and state your action aloud.{occl_note}"
    )


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
    multimodal_result: Optional[Any] = None,
    occlusion_reconstructed: bool = False,
) -> list[FeedbackItem]:
    """Generate explainable coaching feedback, enriched with Contrastive Diagnostic NLG."""
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

    # If multimodal scoring result is available, generate contrastive diagnostic sentence
    if multimodal_result is not None:
        contrastive_msg = generate_contrastive_nlg(
            alignment_state=getattr(multimodal_result, "alignment_state", "DUAL_PATHWAY_FAILURE"),
            nli_probabilities=getattr(multimodal_result, "nli_probabilities", None),
            joint_residuals=getattr(multimodal_result, "joint_residuals", {}),
            current_step_name=step_update.step_now,
            occlusion_reconstructed=occlusion_reconstructed,
        )
        severity = "info" if "SYNCHRONIZED_MASTERY" in str(getattr(multimodal_result, "alignment_state", "")) else "warning"
        return [
            FeedbackItem(
                code="CONTRASTIVE_NLG",
                message=contrastive_msg,
                severity=severity,
            )
        ]

    if not validation.valid:
        if validation.violations:
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
