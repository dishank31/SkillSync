"""
Centralized configuration for all tunable thresholds.

Every magic number (smoothing alpha, jump limit, stable-frame count,
tolerances) lives here so it is easy to find, review, and adjust.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TrackingConfig(BaseModel):
    """MediaPipe and detection settings."""

    # MediaPipe HandLandmarker
    min_detection_confidence: float = Field(0.5, ge=0.0, le=1.0)
    min_presence_confidence: float = Field(0.5, ge=0.0, le=1.0)
    min_tracking_confidence: float = Field(0.5, ge=0.0, le=1.0)
    num_hands: int = Field(1, ge=1, le=2)

    # Smoothing – single EMA pass on landmarks only (no second pass on angles).
    landmark_smoothing_alpha: float = Field(
        0.4,
        ge=0.0,
        le=1.0,
        description="EMA alpha for landmark smoothing. Higher = more responsive, noisier.",
    )

    # Calibration
    calibration_stable_frames: int = Field(
        15,
        description="Consecutive stable frames required before calibration succeeds.",
    )

    # Detection confidence threshold
    partial_confidence_threshold: float = Field(
        0.7,
        ge=0.0,
        le=1.0,
        description="Below this presence confidence, state is PARTIAL_OR_UNRELIABLE.",
    )

    # Jump detection – per-landmark Euclidean distance in normalized coords.
    max_landmark_jump: float = Field(
        0.15,
        description="Max per-landmark Euclidean jump (norm. coords) before filter reset.",
    )

    # Tracking loss
    tracking_loss_timeout_ms: int = Field(
        2500,
        ge=100,
        description="ms without detection before tracking is fully lost.",
    )
    stale_frame_display_ms: int = Field(
        500,
        ge=0,
        description="Show last-known pose as stale for this long after tracking loss.",
    )


class ProcedureConfig(BaseModel):
    """Guided practice and step-evaluation settings."""

    mcp_out_of_range_reset_ms: int = Field(
        3000,
        ge=500,
        description="Reset procedure after MCP is out of range for this long.",
    )


class ScoringConfig(BaseModel):
    """Stability-scorer settings."""

    stability_window_size: int = Field(20, ge=2)
    stability_min_samples: int = Field(6, ge=2)
    stability_cv_scale: float = Field(0.15, gt=0.0)


class SkillSyncConfig(BaseModel):
    """Top-level configuration container."""

    tracking: TrackingConfig = Field(default_factory=TrackingConfig)
    procedure: ProcedureConfig = Field(default_factory=ProcedureConfig)
    scoring: ScoringConfig = Field(default_factory=ScoringConfig)


_config: SkillSyncConfig | None = None


def get_config() -> SkillSyncConfig:
    """Return the singleton config instance."""
    global _config
    if _config is None:
        _config = SkillSyncConfig()
    return _config


from app.core.settings import Settings, get_settings  # noqa: E402

