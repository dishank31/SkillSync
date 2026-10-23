"""
Real-Time WebSocket Training API for Multimodal Telemetry Streaming.

Exposes:
  - /ws/realtime-training/{session_id}: Full CCNLP multimodal stream integrating
    1€ smoothing -> 3D metric angles -> anatomical coupling -> state machine ->
    NLI verbal-motor scoring -> contrastive NLG -> dual-memory decay.
  - /ws/stream: Backward-compatible legacy stream.
"""

from __future__ import annotations

import base64
import json
import logging
import math
import time
from typing import Any, Dict, Optional, Set
from uuid import uuid4

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.features.hand_tracking.cv.hand_tracker import HandTracker
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.occlusion import (
    apply_anatomical_kinematic_coupling,
)
from app.features.hand_tracking.feature_engineering.smoothing import (
    filter_landmarks_for_session,
)
from app.features.procedure_intelligence.engine.decay_predictor import (
    compute_dual_memory_stability,
    predict_decay,
)
from app.features.procedure_intelligence.engine.feedback import (
    generate_contrastive_nlg,
    generate_feedback,
)
from app.features.procedure_intelligence.engine.rules import evaluate_step_constraints
from app.features.procedure_intelligence.engine.schema import (
    PROCEDURES,
    load_procedure_schema,
)
from app.features.procedure_intelligence.engine.scoring import (
    CognitiveMotorState,
    MultimodalScoreResult,
    MultimodalStepScorer,
)
from app.features.procedure_intelligence.engine.session_aggregator import SessionAggregator
from app.features.procedure_intelligence.engine.state_machine import (
    SESSIONS,
    get_session_state,
    update_step,
)
from app.features.realtime_feedback.schemas.request import (
    FrameRequest,
    RealtimeFrameRequest,
    RealtimeTelemetryResponse,
)
from app.features.realtime_feedback.schemas.response import FeedbackItem, FrameResponse
from app.features.realtime_feedback.service.pipeline import process_frame
from app.shared.json_safe import sanitize_for_json

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

ACTIVE_WEBSOCKET_SESSIONS: Set[str] = set()

# In-memory per-session aggregators and trackers
_SESSION_AGGREGATORS: Dict[str, SessionAggregator] = {}
_HAND_TRACKERS: Dict[str, HandTracker] = {}


def _get_tracker_for_session(session_id: str) -> HandTracker:
    if session_id not in _HAND_TRACKERS:
        _HAND_TRACKERS[session_id] = HandTracker()
    return _HAND_TRACKERS[session_id]


# ── Full Multimodal CCNLP WebSocket Endpoint ───────────────────────────────────

@router.websocket("/ws/realtime-training/{session_id}")
async def ws_realtime_training(websocket: WebSocket, session_id: str) -> None:
    """Async WebSocket streaming endpoint for synchronized multimodal CV + NLP training."""
    await websocket.accept()
    ACTIVE_WEBSOCKET_SESSIONS.add(session_id)
    logger.info(f"WebSocket connected for session: {session_id}")

    scorer = MultimodalStepScorer.get_instance()
    last_procedure_id = "soldering_practice"
    current_difficulty = "beginner"

    try:
        while True:
            try:
                raw_payload = await websocket.receive_text()
                data = json.loads(raw_payload)
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning(f"WebSocket receive error on session {session_id}: {e}")
                continue

            try:
                # Support session_id injection if omitted in client payload
                if "session_id" not in data:
                    data["session_id"] = session_id
                req = RealtimeFrameRequest.model_validate(data)
            except ValidationError as ve:
                logger.debug(f"Frame validation warning: {ve}")
                continue

            last_procedure_id = req.procedure_id
            current_difficulty = req.difficulty
            timestamp_ms = req.timestamp_ms or (time.time() * 1000.0)
            timestamp_sec = timestamp_ms / 1000.0

            # 1. Landmark Acquisition (either decoded from frame_b64 or pre-extracted)
            world_landmarks = req.world_landmarks
            image_landmarks = req.image_landmarks or []

            if req.frame_b64 and not world_landmarks:
                try:
                    raw_b64 = req.frame_b64
                    if "," in raw_b64:
                        raw_b64 = raw_b64.split(",", 1)[1]
                    img_bytes = base64.b64decode(raw_b64)
                    np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
                    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        tracker = _get_tracker_for_session(session_id)
                        track_res = tracker.process_frame(frame)
                        if track_res.world_landmarks:
                            world_landmarks = track_res.world_landmarks
                        if track_res.image_landmarks:
                            image_landmarks = track_res.image_landmarks
                except Exception as frame_err:
                    logger.debug(f"Base64 frame decoding failed: {frame_err}")

            # 2. Check Detection State
            has_hand = bool(world_landmarks and len(world_landmarks) >= 21)
            detection_state = "hand_detected" if has_hand else "no_hand"

            # 3. 1€ Velocity-Adaptive Smoothing
            filtered_world = (
                filter_landmarks_for_session(session_id, world_landmarks, timestamp_sec)
                if has_hand
                else []
            )

            # 4. 3D Metric Angles & Invariant Pinch Distances
            angles: Dict[str, Optional[float]] = {}
            distances: Dict[str, Optional[float]] = {}
            occlusion_reconstructed = False

            if has_hand and filtered_world:
                angles = compute_angles(filtered_world)
                distances = compute_distances(filtered_world)

                # Anatomical kinematic coupling for self-occluded distal joints
                angles, occlusion_reconstructed = apply_anatomical_kinematic_coupling(angles)

            # 5. Procedure State Machine
            if getattr(req, "command", None) in ("reset", "restart", "start"):
                reset_session(procedure_id=last_procedure_id, session_key=session_id)

            state = get_session_state(
                procedure_id=last_procedure_id,
                session_key=session_id,
            )
            step_id = state.current_step_id

            try:
                proc_schema = load_procedure_schema(last_procedure_id, current_difficulty)
                step_schema = proc_schema.step_by_id().get(step_id)
            except Exception:
                step_schema = None

            step_name = step_schema.name if step_schema else step_id.replace("_", " ").title()
            step_hyp = (
                step_schema.verbal_hypothesis
                if step_schema and step_schema.verbal_hypothesis
                else (step_schema.method if step_schema else f"I am executing {step_name}.")
            )
            dwell_target = step_schema.dwell_time_ms if step_schema else 2000

            # Evaluate step constraints
            validation = evaluate_step_constraints(
                step=step_schema,
                angles=angles,
                distances=distances,
            )

            # Advance state machine via update_step
            step_update = update_step(
                procedure_id=last_procedure_id,
                session_key=session_id,
                valid_constraints=validation.valid,
                is_observed=has_hand,
                timestamp_ms=int(timestamp_ms),
            )

            # 6. CCNLP Multimodal NLI Verbal-Motor Entailment
            target_angle_bounds = (
                {k: (v.min, v.max) for k, v in step_schema.constraints.angles.items()}
                if step_schema
                else {}
            )

            multimodal_score: MultimodalScoreResult = scorer.score_step(
                spoken_utterance=req.spoken_utterance,
                step_hypothesis=step_hyp,
                joint_angles={k: v for k, v in angles.items() if v is not None},
                target_bounds=target_angle_bounds,
                stability_score=1.0 if validation.valid else 0.7,
                utterance_latency_sec=req.utterance_latency_sec,
            )

            # 7. Contrastive Diagnostic NLG
            contrastive_msg = generate_contrastive_nlg(
                alignment_state=multimodal_score.alignment_state.value,
                nli_probabilities=multimodal_score.nli_probabilities,
                joint_residuals=multimodal_score.joint_residuals,
                current_step_name=step_name,
                step_hypothesis=step_hyp,
                occlusion_reconstructed=occlusion_reconstructed,
            )

            feedback_list = generate_feedback(
                validation=validation,
                step_update=step_update,
                detection_state=detection_state,
                multimodal_result=multimodal_score,
                occlusion_reconstructed=occlusion_reconstructed,
            )

            # 8. Dual-Memory Skill Decay Modeling
            dual_decay = compute_dual_memory_stability(
                sessions=[],
                nli_entailment_rate=multimodal_score.nli_probabilities.p_entailment,
                nli_contradiction_rate=multimodal_score.nli_probabilities.p_contradiction,
            )

            # 9. Dwell Progress
            dwell_rem = max(0, int(step_update.dwell_remaining_ms))
            dwell_progress = (
                max(0.0, min(100.0, (1.0 - (dwell_rem / max(1, dwell_target))) * 100.0))
                if dwell_target > 0
                else 100.0
            )

            # Assemble Telemetry Response
            telemetry = RealtimeTelemetryResponse(
                session_id=session_id,
                timestamp_ms=timestamp_ms,
                step=step_update.step_now,
                step_name=step_name,
                step_hypothesis=step_hyp,
                valid=validation.valid,
                score=multimodal_score.composite_score,
                composite_score=multimodal_score.composite_score,
                alignment_state=multimodal_score.alignment_state.value,
                p_entailment=multimodal_score.nli_probabilities.p_entailment,
                p_neutral=multimodal_score.nli_probabilities.p_neutral,
                p_contradiction=multimodal_score.nli_probabilities.p_contradiction,
                kinematic_score=multimodal_score.kinematic_score,
                contrastive_feedback=contrastive_msg,
                feedback=feedback_list,
                declarative_retention_24h=dual_decay.declarative_cognitive_retention_24h,
                declarative_retention_7d=dual_decay.declarative_cognitive_retention_7d,
                procedural_retention_24h=dual_decay.procedural_motor_retention_24h,
                procedural_retention_7d=dual_decay.procedural_motor_retention_7d,
                intervention_recommendation=dual_decay.intervention_recommendation,
                joint_residuals=multimodal_score.joint_residuals,
                joint_compliance=multimodal_score.joint_compliance,
                angles=angles,
                distances=distances,
                image_landmarks=image_landmarks,
                world_landmarks=filtered_world if filtered_world else (world_landmarks or []),
                occlusion_reconstructed=occlusion_reconstructed,
                stability_score=multimodal_score.stability_score,
                dwell_remaining_ms=dwell_rem,
                step_dwell_total_ms=dwell_target,
                step_progress_pct=round(dwell_progress, 1),
            )

            out_dict = sanitize_for_json(telemetry.model_dump())
            await websocket.send_text(json.dumps(out_dict, ensure_ascii=False))

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected: {session_id}")
    finally:
        ACTIVE_WEBSOCKET_SESSIONS.discard(session_id)
        SESSIONS.pop(session_id, None)
        _HAND_TRACKERS.pop(session_id, None)
        _SESSION_AGGREGATORS.pop(session_id, None)


# ── Backward-Compatible Legacy Endpoint ────────────────────────────────────────

@router.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    session_key = str(uuid4())
    ACTIVE_WEBSOCKET_SESSIONS.add(session_key)
    last_procedure_id = "soldering_practice"
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                logger.warning("Malformed websocket payload: %s", exc)
                continue

            try:
                request = FrameRequest.model_validate(payload)
            except ValidationError as exc:
                logger.warning("Frame validation failed: %s", exc)
                continue

            last_procedure_id = request.procedure_id

            try:
                response = process_frame(request, session_key=session_key)
                out = sanitize_for_json(response.model_dump())
                text = json.dumps(
                    out, separators=(",", ":"), ensure_ascii=False, allow_nan=False
                )
                await websocket.send_text(text)
            except Exception:
                logger.exception("process_frame failed; sending fallback frame")
                st = get_session_state(
                    procedure_id=last_procedure_id, session_key=session_key
                )
                fallback = FrameResponse(
                    step=st.current_step_id,
                    valid=False,
                    score=0.0,
                    feedback=[
                        FeedbackItem(
                            code="SERVER_ERROR",
                            message="Brief processing hiccup — stay on this step and keep your hand visible.",
                            severity="warning",
                        )
                    ],
                )
                out = sanitize_for_json(fallback.model_dump())
                text = json.dumps(
                    out, separators=(",", ":"), ensure_ascii=False, allow_nan=False
                )
                await websocket.send_text(text)
    except WebSocketDisconnect:
        return
    finally:
        ACTIVE_WEBSOCKET_SESSIONS.discard(session_key)
        SESSIONS.pop(session_key, None)
