"""
Core real-time hand-tracking feedback pipeline.

Strict execution order (Phase C):
1. Validate landmarks (count == 21, finite coordinates, confidence check).
2. Determine detection state: NO_HAND, HAND_DETECTED, PARTIAL_OR_UNRELIABLE, TRACKING_RECOVERED.
3. Distinguish observed vs estimated/stale frames.
4. Scale- and position-normalize landmarks (wrist origin, palm-width scale).
5. Apply ONE modest, configurable EMA smoothing pass on landmarks only.
   (No second smoothing pass on derived angles).
6. Compute correct 3D angles and scale-invariant distances from filtered landmarks.
   (Missing/invalid measurements return None, never 0.0).
7. Evaluate procedure constraints only against valid measurements.
8. Monotonic hold timer advances ONLY on valid, observed frames.
9. Estimated frames are visualized if desired, but NEVER count toward scoring or hold timers.
10. On tracking loss, clear stale angles, pause hold timer, and signal unavailable.
"""

from __future__ import annotations

import math
from typing import Any, Optional
from uuid import uuid4

from app.core.config import get_config
from app.features.hand_tracking.cv.detection import DetectionState, DetectionStateTracker
from app.features.hand_tracking.cv.landmarks import normalize_landmarks
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.occlusion import JointOcclusionEstimator
from app.features.hand_tracking.feature_engineering.smoothing import reset_smoother, smooth_landmarks
from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
from app.features.procedure_intelligence.engine.decay_predictor import DecaySummary, predict_decay
from app.features.procedure_intelligence.engine.feedback import generate_feedback
from app.features.procedure_intelligence.engine.rules import validate_step
from app.features.procedure_intelligence.engine.schema import load_procedure_schema
from app.features.procedure_intelligence.engine.scoring import compute_score
from app.features.procedure_intelligence.engine.session_aggregator import SessionAggregator
from app.features.procedure_intelligence.engine.stability import StabilityScorer
from app.features.procedure_intelligence.engine.state_machine import (
    get_current_step_id,
    reset_session,
    update_step,
)
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FeedbackItem, FrameResponse, StepInfo

# Per-session component registries (strictly keyed per session, never shared globally)
_STABILITY_BY_SESSION: dict[str, StabilityScorer] = {}
_METRIC_HISTORY: dict[str, Any] = {}  # Retained for backward-compat test fixture clearing
_AGGREGATORS: dict[str, SessionAggregator] = {}
_JOINT_OCCLUSION_BY_SESSION: dict[str, JointOcclusionEstimator] = {}
_STATE_TRACKERS_BY_SESSION: dict[str, DetectionStateTracker] = {}
_LAST_OBSERVED_BY_SESSION: dict[str, list[list[float]]] = {}
_LAST_SEEN_MS_BY_SESSION: dict[str, int] = {}


def _validate_raw_landmarks(lms: list[list[float]] | None) -> list[list[float]] | None:
    """Ensure exactly 21 landmarks with finite numeric coordinates."""
    if not lms or len(lms) != 21:
        return None
    for pt in lms:
        if len(pt) < 3 or not all(math.isfinite(coord) for coord in pt[:3]):
            return None
    return lms


def process_frame(
    request: FrameRequest,
    *,
    session_key: str | None = None,
) -> FrameResponse:
    cfg = get_config()
    session_id = session_key or f"sess_{uuid4().hex}"

    # 1. Acquire raw landmarks
    camera_runtime = get_camera_runtime()
    raw_landmarks = request.landmarks if request.landmarks else camera_runtime.latest_landmarks()
    valid_observed = _validate_raw_landmarks(raw_landmarks)

    # 2. Track detection state
    state_tracker = _STATE_TRACKERS_BY_SESSION.setdefault(session_id, DetectionStateTracker())
    estimator = _JOINT_OCCLUSION_BY_SESSION.setdefault(session_id, JointOcclusionEstimator())
    schema = load_procedure_schema(request.procedure_id, difficulty=request.difficulty)
    procedure_steps = [StepInfo(id=s.id, dwell_time_ms=s.dwell_time_ms) for s in schema.steps]

    detection_state: DetectionState
    source_landmarks: list[list[float]] = []
    joint_confidence: dict[str, float] = {}
    is_observed: bool = False
    is_stale: bool = False

    if valid_observed is not None:
        # Hand detected in camera frame
        is_observed = True
        detection_state = state_tracker.update(
            has_landmarks=True,
            confidence=1.0,
            partial_threshold=cfg.tracking.partial_confidence_threshold,
        )
        occ = estimator.observe(valid_observed, timestamp_ms=request.timestamp_ms)
        source_landmarks = occ.landmarks
        joint_confidence = dict(occ.joint_confidence)
        _LAST_OBSERVED_BY_SESSION[session_id] = valid_observed
        _LAST_SEEN_MS_BY_SESSION[session_id] = request.timestamp_ms
    else:
        # Hand occluded or absent
        detection_state = state_tracker.update(
            has_landmarks=False,
            partial_threshold=cfg.tracking.partial_confidence_threshold,
        )
        last_seen = _LAST_SEEN_MS_BY_SESSION.get(session_id, request.timestamp_ms)
        elapsed_since_loss = request.timestamp_ms - last_seen

        # Reset smoother on tracking loss
        reset_smoother(session_id)

        # Handle occlusion estimate / visualization
        estimate = estimator.predict(timestamp_ms=request.timestamp_ms)
        if estimate.expired or not estimate.landmarks or elapsed_since_loss > cfg.tracking.tracking_loss_timeout_ms:
            # Full tracking loss timeout: reset procedure hold and clear pose
            reset_session(procedure_id=request.procedure_id, session_key=session_id)
            _LAST_OBSERVED_BY_SESSION.pop(session_id, None)

            current_step_id = get_current_step_id(procedure_id=request.procedure_id, session_key=session_id)
            return FrameResponse(
                step=current_step_id,
                valid=False,
                score=0.0,
                feedback=[
                    FeedbackItem(
                        code="NO_HAND",
                        message="Tracking lost. Position hand in the camera work area.",
                        severity="warning",
                    )
                ],
                landmarks=[],
                joint_confidence=dict(estimate.joint_confidence),
                landmarks_estimated=False,
                frame_is_observed=False,
                detection_state=DetectionState.NO_HAND.value,
                angles=compute_angles([]),
                distances=compute_distances([]),
                metric_targets={},
                metric_deviations={},
                metric_statuses={},
                procedure_steps=procedure_steps,
                reset=True,
                difficulty=request.difficulty,
                session_saved=False,
                session_report=None,
                fatigue=None,
                skill_decay=None,
            )

        # Within brief occlusion window: retain pose for visualization only (marked stale)
        source_landmarks = estimate.landmarks
        joint_confidence = dict(estimate.joint_confidence)
        is_observed = False
        is_stale = True

    # 3. Position and scale normalization
    normalized = normalize_landmarks(source_landmarks)

    # 4. SINGLE smoothing pass on landmarks only (no double smoothing on angles)
    smoothed = smooth_landmarks(normalized, session_id=session_id)

    # 5. Compute angles and distances from smoothed landmarks
    angles = compute_angles(smoothed)
    distances = compute_distances(smoothed)

    # 6. Current step validation
    current_step_id = get_current_step_id(procedure_id=request.procedure_id, session_key=session_id)
    step_schema = schema.step_by_id()[current_step_id]

    # Evaluate step constraints
    validation = validate_step(
        step=step_schema,
        angles=angles,
        distances=distances,
        scalars=distances,
    )

    # Extract target ranges and deviations for UI 3-state metric display
    metric_targets: dict[str, dict[str, float]] = {}
    metric_deviations: dict[str, Optional[float]] = {}
    metric_statuses: dict[str, str] = {}

    for k, c in step_schema.constraints.angles.items():
        metric_targets[k] = {"min": float(c.min), "max": float(c.max)}
        val = angles.get(k)
        if val is None:
            metric_statuses[k] = "unavailable"
            metric_deviations[k] = None
        elif val < c.min:
            metric_statuses[k] = "outside_range"
            metric_deviations[k] = round(float(c.min - val), 1)
        elif val > c.max:
            metric_statuses[k] = "outside_range"
            metric_deviations[k] = round(float(val - c.max), 1)
        else:
            metric_statuses[k] = "within_range"
            metric_deviations[k] = 0.0

    for k, c in step_schema.constraints.distances.items():
        metric_targets[k] = {
            **({"min": float(c.min)} if c.min is not None else {}),
            **({"max": float(c.max)} if c.max is not None else {}),
        }
        val = distances.get(k)
        if val is None:
            metric_statuses[k] = "unavailable"
            metric_deviations[k] = None
        elif c.min is not None and val < c.min:
            metric_statuses[k] = "outside_range"
            metric_deviations[k] = round(float(c.min - val), 2)
        elif c.max is not None and val > c.max:
            metric_statuses[k] = "outside_range"
            metric_deviations[k] = round(float(val - c.max), 2)
        else:
            metric_statuses[k] = "within_range"
            metric_deviations[k] = 0.0

    # MCP safety check using real index MCP angle (landmarks 0 -> 5 -> 6)
    mcp_val = angles.get("index_mcp_angle") or angles.get("mcp_joint")
    mcp_in_range: bool | None = None
    if mcp_val is not None:
        # Expected ergonomic working posture for index MCP
        mcp_in_range = 100.0 <= float(mcp_val) <= 175.0

    # 7. State Machine update (timer ONLY advances if is_observed is True and constraints valid)
    step_update = update_step(
        valid_constraints=validation.valid if is_observed else False,
        is_observed=is_observed,
        mcp_in_range=mcp_in_range if is_observed else None,
        procedure_id=request.procedure_id,
        session_key=session_id,
        timestamp_ms=request.timestamp_ms,
    )

    # 8. Feedback generation: ONE specific correction for largest deviation
    feedback = generate_feedback(
        validation=validation,
        step_update=step_update,
        detection_state=detection_state.value,
    )

    # 9. Stability scoring (normalized angle jitter only)
    stability_scorer = _STABILITY_BY_SESSION.setdefault(session_id, StabilityScorer())
    if is_observed:
        stability = stability_scorer.update(
            angles=angles,
            distances=distances,
            timestamp_ms=request.timestamp_ms,
        )
    else:
        stability = 0.0

    score = compute_score(valid=(validation.valid and is_observed), stability=stability)

    # 10. Session Aggregator tracking (Phase E)
    aggregator = _AGGREGATORS.setdefault(
        session_id,
        SessionAggregator(
            student_id=request.student_id,
            procedure_id=request.procedure_id,
            difficulty=request.difficulty,
        ),
    )
    if aggregator.student_id != request.student_id:
        aggregator.student_id = request.student_id

    aggregator.feed_frame(
        step_id=step_update.step_now,
        valid=validation.valid and is_observed,
        is_observed=is_observed,
        score=score,
        stability=stability,
        timestamp_ms=request.timestamp_ms,
        deviations=[abs(d) for d in metric_deviations.values() if d is not None],
    )

    session_saved = False
    session_report: dict[str, Any] | None = None
    skill_decay: DecaySummary | None = None

    if step_update.step_now == "completed" and step_update.advanced:
        session_report = aggregator.complete_session(timestamp_ms=request.timestamp_ms)
        if session_report is not None:
            session_saved = True
            _AGGREGATORS.pop(session_id, None)
            skill_decay = DecaySummary(**predict_decay(request.student_id))

    return FrameResponse(
        step=step_update.step_now,
        valid=validation.valid and is_observed,
        score=score,
        feedback=feedback,
        landmarks=source_landmarks if (is_observed or is_stale) else [],
        joint_confidence=joint_confidence,
        landmarks_estimated=not is_observed,
        frame_is_observed=is_observed,
        detection_state=detection_state.value,
        angles=angles if is_observed else compute_angles([]),
        distances=distances if is_observed else compute_distances([]),
        metric_targets=metric_targets,
        metric_deviations=metric_deviations,
        metric_statuses=metric_statuses,
        procedure_steps=procedure_steps,
        reset=bool(step_update.reset),
        difficulty=request.difficulty,
        session_saved=session_saved,
        session_report=session_report,
        fatigue=None,
        skill_decay=skill_decay,
    )
