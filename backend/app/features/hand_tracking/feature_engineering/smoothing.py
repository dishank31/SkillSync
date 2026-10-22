"""
Exponential-moving-average (EMA) landmark smoother.

Rules
-----
- ONE pass on landmarks only; angles are computed from smoothed landmarks,
  never smoothed again.
- State is keyed per ``session_id`` — every session gets its own filter
  state. A shared / default key is never used.
- Resets on frame-to-frame jumps or when explicitly told to.
"""

from __future__ import annotations

import math
from typing import Optional
from uuid import uuid4

from app.core.config import get_config

# session_id → previous smoothed landmarks
_EMA_HISTORY: dict[str, list[list[float]]] = {}


def _max_jump(
    prev: list[list[float]], curr: list[list[float]]
) -> float:
    """Return the largest per-landmark Euclidean jump between two frames."""
    max_d = 0.0
    for p, c in zip(prev, curr, strict=False):
        d = math.sqrt(
            (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
        )
        if d > max_d:
            max_d = d
    return max_d


def smooth_landmarks(
    landmarks: list[list[float]],
    *,
    session_id: str | None = None,
    session_key: str | None = None,
    alpha: float | None = None,
) -> list[list[float]]:
    """Apply a single EMA pass to the given landmarks.

    Args:
        landmarks: Current frame's 21 [x, y, z] landmarks.
        session_id / session_key: **Required** unique session identifier.
            Never a shared default across users.
        alpha: Override smoothing weight (0 = fully previous, 1 = fully
            current). Defaults to ``config.tracking.landmark_smoothing_alpha``.

    Returns:
        Smoothed landmark positions.
    """
    if not landmarks:
        return []

    key = session_id or session_key
    if not key:
        # Prevent cross-session contamination (Issue 7)
        key = f"auto_{uuid4().hex}"

    cfg = get_config().tracking
    a = alpha if alpha is not None else cfg.landmark_smoothing_alpha

    previous = _EMA_HISTORY.get(key)

    # Reset the filter when:
    # 1. No previous state, or
    # 2. Landmark count changed, or
    # 3. A frame-to-frame jump exceeds the configured limit.
    needs_reset = (
        previous is None
        or len(previous) != len(landmarks)
        or _max_jump(previous, landmarks) > cfg.max_landmark_jump
    )

    if needs_reset:
        smoothed = [point[:] for point in landmarks]
    else:
        beta = 1.0 - a
        smoothed = [
            [
                a * cur[0] + beta * prev[0],
                a * cur[1] + beta * prev[1],
                a * cur[2] + beta * prev[2],
            ]
            for cur, prev in zip(landmarks, previous, strict=False)
        ]

    _EMA_HISTORY[key] = smoothed
    return smoothed


def reset_smoother(session_id: str) -> None:
    """Explicitly clear the EMA history for a session (e.g. on tracking loss)."""
    _EMA_HISTORY.pop(session_id, None)
