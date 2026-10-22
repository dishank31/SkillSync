"""
MediaPipe Hand Landmarker wrapper.

Uses **VIDEO** running mode with strictly increasing timestamps so
MediaPipe's built-in temporal tracking is active.  Configurable via
``SkillSyncConfig.tracking``.

Returns a ``TrackingResult`` with landmarks, detection state, and
the confidence / handedness values that MediaPipe actually provides
(never invents confidence).
"""

from __future__ import annotations

import os
import time
from typing import Any

import cv2
import mediapipe as mp

from app.core.config import get_config
from app.features.hand_tracking.cv.detection import (
    DetectionState,
    DetectionStateTracker,
    TrackingResult,
)


class HandTracker:
    """Wrapper for MediaPipe Hand Landmarker (Tasks API, VIDEO mode)."""

    def __init__(self) -> None:
        cfg = get_config().tracking
        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        model_path = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                f"MediaPipe model not found at {model_path}"
            )

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=VisionRunningMode.VIDEO,
            num_hands=cfg.num_hands,
            min_hand_detection_confidence=cfg.min_detection_confidence,
            min_hand_presence_confidence=cfg.min_presence_confidence,
            min_tracking_confidence=cfg.min_tracking_confidence,
        )

        self._tracker: Any = HandLandmarker.create_from_options(options)
        self._state_tracker = DetectionStateTracker()
        self._partial_threshold = cfg.partial_confidence_threshold

        # Monotonic timestamp bookkeeping
        self._last_timestamp_ms: int = 0
        self._epoch_ms: int = int(time.monotonic() * 1000)

    def _next_timestamp_ms(self) -> int:
        """Return a strictly increasing monotonic timestamp in ms."""
        now = int(time.monotonic() * 1000)
        ts = max(now, self._last_timestamp_ms + 1)
        self._last_timestamp_ms = ts
        return ts

    def process(self, frame: Any) -> TrackingResult:
        """Detect hand landmarks in a BGR video frame.

        Args:
            frame: OpenCV BGR image (numpy array).

        Returns:
            A ``TrackingResult`` with landmarks, state, and metadata.
        """
        ts = self._next_timestamp_ms()
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        result = self._tracker.detect_for_video(mp_image, ts)

        landmarks: list[list[float]] = []
        handedness: str | None = None
        handedness_conf: float | None = None
        detection_conf: float | None = None

        if result.hand_landmarks:
            hand_lms = result.hand_landmarks[0]
            for lm in hand_lms:
                landmarks.append([lm.x, lm.y, lm.z])

            # Extract handedness if available.
            if result.handedness and len(result.handedness) > 0:
                top = result.handedness[0]
                if len(top) > 0:
                    handedness = top[0].category_name
                    handedness_conf = top[0].score

        has_landmarks = len(landmarks) == 21
        state = self._state_tracker.update(
            has_landmarks=has_landmarks,
            confidence=handedness_conf,
            partial_threshold=self._partial_threshold,
        )

        return TrackingResult(
            landmarks=landmarks,
            timestamp_ms=ts,
            detection_state=state,
            handedness=handedness,
            handedness_confidence=handedness_conf,
            detection_confidence=detection_conf,
            frame_is_observed=has_landmarks,
        )

    def close(self) -> None:
        """Release MediaPipe resources."""
        if self._tracker is not None:
            self._tracker.close()
            self._tracker = None
