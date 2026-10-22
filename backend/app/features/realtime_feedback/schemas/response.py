from typing import Any, Optional

from pydantic import BaseModel

from app.features.procedure_intelligence.engine.decay_predictor import DecaySummary


class FeedbackItem(BaseModel):
    code: str
    message: str
    severity: str = "info"


class StepInfo(BaseModel):
    id: str
    dwell_time_ms: int


class FatigueInfo(BaseModel):
    fatigue_level: str
    fatigue_score: float
    recommended_break_seconds: int
    session_minutes: float
    warning_message: Optional[str] = None


class FrameResponse(BaseModel):
    step: str
    valid: bool
    score: float
    feedback: list[FeedbackItem]
    landmarks: list[list[float]] = []
    joint_confidence: dict[str, float] = {}
    landmarks_estimated: bool = False
    frame_is_observed: bool = True
    detection_state: str = "hand_detected"
    angles: dict[str, Optional[float]] = {}
    distances: dict[str, Optional[float]] = {}
    metric_targets: dict[str, dict[str, float]] = {}
    metric_deviations: dict[str, Optional[float]] = {}
    metric_statuses: dict[str, str] = {}
    procedure_steps: list[StepInfo] = []
    reset: bool = False
    difficulty: str = "beginner"
    session_saved: bool = False
    session_report: Optional[dict[str, Any]] = None
    fatigue: Optional[FatigueInfo] = None
    skill_decay: Optional[DecaySummary] = None
