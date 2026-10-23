"""
Detection-state tracking for the hand-landmark pipeline.

Provides explicit states so downstream code never has to infer
"no hand" from an empty list.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class DetectionState(str, Enum):
    """Explicit detection states for hand tracking."""

    NO_HAND = "no_hand"
    """No hand detected in the frame."""

    HAND_DETECTED = "hand_detected"
    """Hand detected with sufficient confidence."""

    PARTIAL_OR_UNRELIABLE = "partial_or_unreliable"
    """Hand partially detected or below the confidence threshold."""

    TRACKING_RECOVERED = "tracking_recovered"
    """Hand re-detected after a period of tracking loss."""


@dataclass(frozen=True)
class TrackingResult:
    """Structured result from hand detection.

    Carries 2D image landmarks, 3D metric world landmarks, and detection
    metadata directly from MediaPipe.
    """

    landmarks: list[list[float]]
    """21 [x, y, z] landmarks in normalised image coords (backward compatibility)."""

    timestamp_ms: int
    """Monotonic timestamp (ms) when this frame was processed."""

    detection_state: DetectionState
    """Current detection state."""

    world_landmarks: list[list[float]] = field(default_factory=list)
    """21 [x, y, z] metric 3D coordinates in meters from wrist origin."""

    image_landmarks: list[list[float]] = field(default_factory=list)
    """21 [x, y, z] normalised [0, 1] coordinates strictly for canvas rendering."""

    handedness: str | None = None
    """'Left' or 'Right' as reported by MediaPipe, or None."""

    handedness_confidence: float | None = None
    """MediaPipe's handedness classification score, or None."""

    detection_confidence: float | None = None
    """MediaPipe's hand-detection score, or None."""

    frame_is_observed: bool = True
    """True when landmarks come from real detection; False when stale."""


class DetectionStateTracker:
    """Tracks transitions between detection states.

    Distinguishes HAND_DETECTED from TRACKING_RECOVERED by remembering
    whether there was a preceding tracking-loss period.
    """

    def __init__(self) -> None:
        self._previous_state: DetectionState = DetectionState.NO_HAND
        self._was_lost: bool = False

    def update(
        self,
        has_landmarks: bool,
        confidence: float | None = None,
        partial_threshold: float = 0.7,
    ) -> DetectionState:
        """Determine detection state for the current frame.

        Args:
            has_landmarks: Whether MediaPipe returned landmarks.
            confidence: Detection / presence confidence from MediaPipe.
            partial_threshold: Below this → PARTIAL_OR_UNRELIABLE.

        Returns:
            The new DetectionState.
        """
        if not has_landmarks:
            self._was_lost = True
            new_state = DetectionState.NO_HAND
        elif confidence is not None and confidence < partial_threshold:
            new_state = DetectionState.PARTIAL_OR_UNRELIABLE
        elif self._was_lost:
            self._was_lost = False
            new_state = DetectionState.TRACKING_RECOVERED
        else:
            new_state = DetectionState.HAND_DETECTED

        self._previous_state = new_state
        return new_state

    def reset(self) -> None:
        """Reset to initial state."""
        self._previous_state = DetectionState.NO_HAND
        self._was_lost = False


def ensure_hand_landmarker_model(
    target_path: str | Path | None = None,
    url: str | None = None,
) -> Path:
    """Verify hand_landmarker.task exists or download it automatically.

    Args:
        target_path: Custom destination path if specified.
        url: Custom download URL if specified.

    Returns:
        The validated Path to hand_landmarker.task.
    """
    import urllib.request
    from pathlib import Path
    from app.core.settings import get_settings

    settings = get_settings()
    dest = Path(target_path) if target_path else settings.hand_landmarker_path

    if dest.is_file() and dest.stat().st_size > 100_000:
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    download_url = url or settings.hand_landmarker_url
    urllib.request.urlretrieve(download_url, str(dest))
    return dest

