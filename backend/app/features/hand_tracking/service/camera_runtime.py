"""
Background camera runtime.

Captures frames from a local webcam in a daemon thread and runs
``HandTracker.process()`` to produce ``TrackingResult`` objects.

The runtime is only used when the backend itself drives the camera
(``auto_start_camera = True`` in settings).  The default flow is
frontend-side detection via ``useCamera.ts``.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Optional

from app.shared.utils.logger import get_logger
from app.features.hand_tracking.cv.detection import DetectionState, TrackingResult

logger = get_logger(__name__)


class CameraRuntime:
    """Threaded camera capture + hand detection loop."""

    def __init__(self, *, fps: int = 30, device_index: int = 0) -> None:
        self._fps = max(fps, 1)
        self._device_index = device_index
        self._tracker: Any = None
        self._capture: Any = None
        self._cv2: Any = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._running = False

        # Latest tracking result (thread-safe via _lock).
        self._latest_result: TrackingResult = TrackingResult(
            landmarks=[],
            timestamp_ms=0,
            detection_state=DetectionState.NO_HAND,
            frame_is_observed=False,
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _ensure_camera_deps(self) -> bool:
        if self._cv2 is not None and self._tracker is not None:
            return True

        try:
            import cv2  # type: ignore
            from app.features.hand_tracking.cv.hand_tracker import HandTracker
        except Exception as exc:
            logger.warning("Camera runtime dependencies unavailable: %s", exc)
            return False

        self._cv2 = cv2
        if self._tracker is None:
            try:
                self._tracker = HandTracker()
            except Exception as exc:
                logger.exception("Failed to initialize hand tracker: %s", exc)
                return False
        return True

    def start(self) -> bool:
        if self._running:
            return True

        if not self._ensure_camera_deps():
            return False

        self._capture = self._cv2.VideoCapture(self._device_index)
        if not self._capture.isOpened():
            logger.error("Failed to open camera device %s", self._device_index)
            self._capture.release()
            self._capture = None
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        self._running = True
        logger.info("Camera runtime started on device %s", self._device_index)
        return True

    def stop(self) -> None:
        if not self._running:
            return

        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

        if self._capture is not None:
            self._capture.release()
            self._capture = None

        if self._tracker is not None:
            try:
                self._tracker.close()
            except Exception:
                pass

        self._thread = None
        self._running = False
        logger.info("Camera runtime stopped")

    def is_running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def latest_result(self) -> TrackingResult:
        """Thread-safe access to the most recent tracking result."""
        with self._lock:
            return self._latest_result

    def latest_landmarks(self) -> list[list[float]]:
        """Backwards-compatible accessor for raw landmarks."""
        with self._lock:
            return list(self._latest_result.landmarks)

    def latest_timestamp_ms(self) -> int:
        with self._lock:
            return self._latest_result.timestamp_ms

    # ------------------------------------------------------------------
    # Capture loop
    # ------------------------------------------------------------------

    def _capture_loop(self) -> None:
        frame_interval = 1.0 / self._fps

        while not self._stop_event.is_set():
            start_time = time.perf_counter()
            if self._capture is None or self._tracker is None:
                break

            ok, frame = self._capture.read()
            if ok:
                result = self._tracker.process(frame)
                with self._lock:
                    self._latest_result = result

            elapsed = time.perf_counter() - start_time
            sleep_for = frame_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_camera_runtime: Optional[CameraRuntime] = None


def get_camera_runtime(*, fps: int = 30, device_index: int = 0) -> CameraRuntime:
    global _camera_runtime
    if _camera_runtime is None:
        _camera_runtime = CameraRuntime(fps=fps, device_index=device_index)
    return _camera_runtime
