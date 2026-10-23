from typing import Any, Optional

from pydantic import BaseModel, Field

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

    # CCNLP Multimodal Telemetry Fields
    alignment_state: Optional[str] = "SYNCHRONIZED_MASTERY"
    p_entailment: Optional[float] = 0.0
    p_neutral: Optional[float] = 1.0
    p_contradiction: Optional[float] = 0.0
    kinematic_score: Optional[float] = 0.0
    contrastive_feedback: Optional[str] = None
    declarative_retention_24h: Optional[float] = 80.0
    declarative_retention_7d: Optional[float] = 30.0
    procedural_retention_24h: Optional[float] = 85.0
    procedural_retention_7d: Optional[float] = 40.0
    intervention_recommendation: Optional[str] = None
    joint_residuals: dict[str, float] = Field(default_factory=dict)
    occlusion_reconstructed: bool = False
    dwell_remaining_ms: int = 0
    step_dwell_total_ms: int = 0
    step_progress_pct: float = 0.0
