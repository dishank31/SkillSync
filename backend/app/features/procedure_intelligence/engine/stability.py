"""
Rolling-window stability score.

Computes jitter from *normalised*, same-unit features only (angles in
degrees). Distances are excluded because they have a different scale
and mixing them biases the score (Step 0, issue 8).

The score is 0-1 where higher = more stable. It is NOT a fatigue
metric — it measures hand steadiness only.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import mean, pstdev
from typing import Optional

from app.core.config import get_config


@dataclass(frozen=True)
class _Snapshot:
    timestamp_ms: int
    values: tuple[float, ...]


class StabilityScorer:
    """Rolling-window stability score based on angle jitter."""

    def __init__(
        self,
        *,
        window_size: int | None = None,
        min_samples: int | None = None,
        cv_scale: float | None = None,
        idle_reset_ms: int = 5_000,
        eps: float = 1e-6,
    ) -> None:
        cfg = get_config().scoring
        self._window_size = window_size if window_size is not None else cfg.stability_window_size
        self._min_samples = min_samples if min_samples is not None else cfg.stability_min_samples
        self._cv_scale = cv_scale if cv_scale is not None else cfg.stability_cv_scale
        self._eps = float(eps)
        self._idle_reset_ms = int(idle_reset_ms)
        self._feature_order: tuple[str, ...] | None = None
        self._history: deque[_Snapshot] = deque(maxlen=self._window_size)

    def reset(self) -> None:
        self._feature_order = None
        self._history.clear()

    def update(
        self,
        angles: dict[str, Optional[float]],
        distances: dict[str, Optional[float]] | None = None,
        timestamp_ms: int = 0,
    ) -> float:
        """Update with new frame data and return the stability score.

        Only angles with actual float values are used; ``None`` angles
        are skipped. Distances are excluded from jitter calculation to avoid
        mixed-unit bias.
        """
        if self._history:
            last_t = self._history[-1].timestamp_ms
            if timestamp_ms < last_t or (timestamp_ms - last_t) > self._idle_reset_ms:
                self.reset()

        valid_angles: dict[str, float] = {
            k: float(v) for k, v in (angles or {}).items() if v is not None
        }

        if not valid_angles:
            return 1.0

        if self._feature_order is None:
            self._feature_order = tuple(sorted(valid_angles.keys()))

        values: list[float] = []
        for k in self._feature_order:
            v = valid_angles.get(k)
            if v is not None:
                values.append(float(v))

        if not values:
            return 1.0

        self._history.append(
            _Snapshot(timestamp_ms=int(timestamp_ms), values=tuple(values))
        )

        if len(self._history) < max(2, self._min_samples):
            return 1.0

        by_dim = list(zip(*(s.values for s in self._history), strict=False))
        cvs: list[float] = []
        for series in by_dim:
            mu = mean(series)
            sigma = pstdev(series)
            cvs.append(sigma / (abs(mu) + self._eps))

        jitter = mean(cvs) if cvs else 0.0
        stability = 1.0 / (1.0 + jitter / max(self._cv_scale, self._eps))
        return max(0.0, min(1.0, float(stability)))
