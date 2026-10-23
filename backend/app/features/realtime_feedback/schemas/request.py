"""
Request and Telemetry response schemas for real-time WebSocket training streams.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.features.realtime_feedback.schemas.response import FeedbackItem, StepInfo, DecaySummary, FatigueInfo


class RealtimeFrameRequest(BaseModel):
    """Payload sent by client per video frame or landmark capture."""
    session_id: str = Field(..., description="Unique training session ID")
    procedure_id: str = Field("soldering_practice", description="Procedure identifier")
    timestamp_ms: float = Field(..., description="Client epoch timestamp in ms")
    frame_id: int = Field(0, description="Sequential frame index")
    student_id: str = Field("anonymous", description="Student ID")
    difficulty: str = Field("beginner", description="Difficulty level")

    # Optional multimodal inputs
    frame_b64: Optional[str] = Field(None, description="Base64 encoded JPEG/PNG webcam frame")
    world_landmarks: Optional[List[List[float]]] = Field(None, description="21 3D metric landmarks (meters)")
    image_landmarks: Optional[List[List[float]]] = Field(None, description="21 2D normalized landmarks [0, 1]")
    spoken_utterance: Optional[str] = Field(None, description="Live speech transcript from Think-Aloud callout")
    utterance_latency_sec: float = Field(0.0, description="Elapsed latency between step transition and utterance")
    command: Optional[str] = Field(None, description="Session control command: start, stop, pause, resume, reset, next_step")

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_student_id(cls, value: object) -> str:
        if value is None or (isinstance(value, str) and not value.strip()):
            return "anonymous"
        return str(value).strip().lower()

    @field_validator("world_landmarks", "image_landmarks", mode="before")
    @classmethod
    def coerce_landmarks(cls, value: object) -> Optional[List[List[float]]]:
        if not isinstance(value, list):
            return None
        out: List[List[float]] = []
        for item in value:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            try:
                coords = [float(x) for x in item[:3]]
                if all(math.isfinite(v) for v in coords):
                    out.append(coords)
            except (TypeError, ValueError):
                continue
        return out if len(out) >= 21 else None


class RealtimeTelemetryResponse(BaseModel):
    """Unified telemetry response streamed back to Next.js client."""
    session_id: str
    timestamp_ms: float
    step: str
    step_name: Optional[str] = None
    step_hypothesis: Optional[str] = None
    valid: bool
    score: float
    composite_score: float = 0.0

    # CCNLP NLP Pillar 2: Verbal-Motor NLI Entailment
    alignment_state: str = "SYNCHRONIZED_MASTERY"
    p_entailment: float = 0.0
    p_neutral: float = 1.0
    p_contradiction: float = 0.0
    kinematic_score: float = 0.0

    # CCNLP NLP Pillar 3: Contrastive NLG & Dual Retention
    contrastive_feedback: str = ""
    feedback: List[FeedbackItem] = Field(default_factory=list)
    declarative_retention_24h: float = 80.0
    declarative_retention_7d: float = 30.0
    procedural_retention_24h: float = 85.0
    procedural_retention_7d: float = 40.0
    intervention_recommendation: str = ""

    # Kinematics & Landmarks
    joint_residuals: Dict[str, float] = Field(default_factory=dict)
    joint_compliance: Dict[str, bool] = Field(default_factory=dict)
    angles: Dict[str, Optional[float]] = Field(default_factory=dict)
    distances: Dict[str, Optional[float]] = Field(default_factory=dict)
    image_landmarks: List[List[float]] = Field(default_factory=list)
    world_landmarks: List[List[float]] = Field(default_factory=list)
    occlusion_reconstructed: bool = False
    stability_score: float = 1.0

    # Progress & State
    dwell_remaining_ms: int = 0
    step_dwell_total_ms: int = 0
    step_progress_pct: float = 0.0
    session_saved: bool = False
    session_report: Optional[Dict[str, Any]] = None


# Backward-compatible legacy alias
class FrameRequest(BaseModel):
    frame_id: int = Field(..., ge=0)
    timestamp_ms: int = Field(..., ge=0)
    landmarks: list[list[float]]
    procedure_id: str
    difficulty: str = Field("beginner", description="beginner or intermediate")
    student_id: str = Field("anonymous", description="Student identifier")
    spoken_utterance: Optional[str] = None
    command: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_student_id(cls, value: object) -> str:
        if value is None or (isinstance(value, str) and not value.strip()):
            return "anonymous"
        return str(value).strip().lower()

    @field_validator("landmarks", mode="before")
    @classmethod
    def coerce_landmarks(cls, value: object) -> list[list[float]]:
        if not isinstance(value, list):
            return []
        out: list[list[float]] = []
        for item in value:
            if not isinstance(item, (list, tuple)) or len(item) < 3:
                continue
            try:
                x, y, z = float(item[0]), float(item[1]), float(item[2])
                if not all(math.isfinite(v) for v in (x, y, z)):
                    continue
                out.append([x, y, z])
            except (TypeError, ValueError):
                continue
        return out
