"""
Velocity-adaptive One-Euro (1€) landmark filter.

Provides zero-jitter precision during stationary holds (low cutoff)
while retaining instant response with near-zero phase lag during rapid
biomechanical transitions (high cutoff proportional to velocity).

References:
    Casiez, G., Roussel, N., & Vogel, D. (2012).
    "1 € filter: a simple speed-based low-pass filter for noisy input in interactive systems."
    CHI '12: Proceedings of the SIGCHI Conference on Human Factors in Computing Systems.
"""

from __future__ import annotations

import math
import time
from typing import Final, Optional
from uuid import uuid4

# Canonical 1€ parameters calibrated for MediaPipe 3D Hand Landmarks
DEFAULT_MIN_CUTOFF: Final[float] = 1.0
DEFAULT_BETA: Final[float] = 0.007
DEFAULT_D_CUTOFF: Final[float] = 1.0
DEFAULT_FREQ: Final[float] = 30.0


class LowPassFilter:
    """First-order low-pass filter."""

    def __init__(self, alpha: float = 0.5) -> None:
        self.alpha = float(alpha)
        self.y: Optional[float] = None

    def filter(self, value: float, alpha: Optional[float] = None) -> float:
        if alpha is not None:
            self.alpha = float(alpha)
        if self.y is None:
            self.y = float(value)
        else:
            self.y = self.alpha * float(value) + (1.0 - self.alpha) * self.y
        return self.y

    def reset(self) -> None:
        self.y = None


class OneEuroFilter:
    """Scalar 1€ adaptive low-pass filter."""

    def __init__(
        self,
        freq: float = DEFAULT_FREQ,
        min_cutoff: float = DEFAULT_MIN_CUTOFF,
        beta: float = DEFAULT_BETA,
        d_cutoff: float = DEFAULT_D_CUTOFF,
    ) -> None:
        self.freq = float(freq)
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self.x_filter = LowPassFilter()
        self.dx_filter = LowPassFilter()
        self.last_time: Optional[float] = None

    def _alpha(self, cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def filter(self, x: float, timestamp_sec: Optional[float] = None) -> float:
        if self.last_time is None or timestamp_sec is None:
            dt = 1.0 / self.freq
        else:
            dt = max(1e-4, timestamp_sec - self.last_time)
        self.last_time = timestamp_sec

        prev_x = self.x_filter.y
        dx = 0.0 if prev_x is None else (x - prev_x) / dt
        edx = self.dx_filter.filter(dx, self._alpha(self.d_cutoff, dt))
        cutoff = self.min_cutoff + self.beta * abs(edx)
        return self.x_filter.filter(x, self._alpha(cutoff, dt))

    def reset(self) -> None:
        self.x_filter.reset()
        self.dx_filter.reset()
        self.last_time = None


class OneEuroLandmarkFilter:
    """Applies independent 1€ filters per coordinate across all 21 3D landmarks."""

    def __init__(
        self,
        num_landmarks: int = 21,
        min_cutoff: float = DEFAULT_MIN_CUTOFF,
        beta: float = DEFAULT_BETA,
        d_cutoff: float = DEFAULT_D_CUTOFF,
        freq: float = DEFAULT_FREQ,
    ) -> None:
        self.num_landmarks = num_landmarks
        self.filters: list[list[OneEuroFilter]] = [
            [
                OneEuroFilter(freq=freq, min_cutoff=min_cutoff, beta=beta, d_cutoff=d_cutoff)
                for _ in range(3)
            ]
            for _ in range(num_landmarks)
        ]

    def filter_landmarks(
        self,
        world_landmarks: list[list[float]],
        timestamp_sec: Optional[float] = None,
    ) -> list[list[float]]:
        """Filter 3D coordinates using velocity-adaptive 1€ filter.

        Args:
            world_landmarks: 21 [x, y, z] coordinate triplets.
            timestamp_sec: Frame timestamp in seconds. If None, monotonic time is used.

        Returns:
            Smoothed 21 [x, y, z] coordinate triplets.
        """
        if not world_landmarks:
            return []

        if timestamp_sec is None:
            timestamp_sec = time.monotonic()

        out: list[list[float]] = []
        n = min(len(world_landmarks), self.num_landmarks)

        for i in range(n):
            pt = world_landmarks[i]
            x_f = self.filters[i][0].filter(float(pt[0]), timestamp_sec)
            y_f = self.filters[i][1].filter(float(pt[1]), timestamp_sec)
            z_f = self.filters[i][2].filter(float(pt[2]), timestamp_sec)
            out.append([x_f, y_f, z_f])

        # If incoming array has more than num_landmarks, append remainder unchanged
        for j in range(n, len(world_landmarks)):
            out.append(list(world_landmarks[j]))

        return out

    def reset(self) -> None:
        """Reset all coordinate filters."""
        for joint_filters in self.filters:
            for coord_filter in joint_filters:
                coord_filter.reset()


# Session-keyed registry of 1€ filters
_SESSION_FILTERS: dict[str, OneEuroLandmarkFilter] = {}


def get_session_one_euro_filter(session_id: str) -> OneEuroLandmarkFilter:
    """Get or create the OneEuroLandmarkFilter instance for a session."""
    if session_id not in _SESSION_FILTERS:
        _SESSION_FILTERS[session_id] = OneEuroLandmarkFilter()
    return _SESSION_FILTERS[session_id]


def reset_session_one_euro_filter(session_id: str) -> None:
    """Clear filter state for a session."""
    _SESSION_FILTERS.pop(session_id, None)


def smooth_landmarks(
    landmarks: list[list[float]],
    *,
    session_id: str | None = None,
    session_key: str | None = None,
    alpha: float | None = None,
    timestamp_sec: float | None = None,
) -> list[list[float]]:
    """Drop-in smoothing function powered by OneEuroLandmarkFilter.

    Retains full signature compatibility for existing callers.
    """
    if not landmarks:
        return []

    key = session_id or session_key or f"auto_{uuid4().hex}"
    filt = get_session_one_euro_filter(key)
    return filt.filter_landmarks(landmarks, timestamp_sec=timestamp_sec)


def filter_landmarks_for_session(
    session_id: str,
    landmarks: list[list[float]],
    timestamp_sec: Optional[float] = None,
) -> list[list[float]]:
    """Filter 3D landmarks for a specific session using OneEuroLandmarkFilter."""
    filt = get_session_one_euro_filter(session_id)
    return filt.filter_landmarks(landmarks, timestamp_sec=timestamp_sec)


def reset_smoother(session_id: str) -> None:
    """Clear smoother state for a session."""
    reset_session_one_euro_filter(session_id)

