"""
Distance metrics from 3D hand landmarks.

All distances except ``palm_width`` are divided by palm width
(landmarks 5 → 17) so they are **scale-invariant**: the value is the
same regardless of how far the hand is from the camera.

Returns ``None`` (not 0) when landmarks are missing or invalid.
MediaPipe z is a relative model coordinate, NOT calibrated depth in cm.
See docs/metrics.md for the full metric catalog.
"""

import math
from typing import Optional


def _euclidean_3d(a: list[float], b: list[float]) -> float:
    """Euclidean distance between two 3D points."""
    return math.sqrt(
        (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    )


def compute_distances(
    landmarks: list[list[float]],
) -> dict[str, Optional[float]]:
    """Compute distance metrics from 21 hand landmarks.

    Metrics returned
    ----------------
    thumb_index_distance : Thumb-tip(4) ↔ Index-tip(8), normalised by palm width.
    index_middle_distance : Index-tip(8) ↔ Middle-tip(12), normalised by palm width.
    palm_width : Raw index-MCP(5) ↔ pinky-MCP(17) distance (the scale reference).
    middle_below_index : 1.0 if middle tip y > index tip y (canvas coords), else 0.0.

    Returns ``None`` for every metric when landmarks are missing.
    """
    _none: dict[str, Optional[float]] = {
        "thumb_index_distance": None,
        "index_middle_distance": None,
        "thumb_index_over_palm": None,
        "index_middle_over_palm": None,
        "palm_width": None,
        "middle_below_index": None,
    }

    if not landmarks or len(landmarks) < 21:
        return dict(_none)

    thumb_tip = landmarks[4]
    index_tip = landmarks[8]
    middle_tip = landmarks[12]

    palm_width = _euclidean_3d(landmarks[5], landmarks[17])

    if palm_width <= 1e-6:
        # Cannot normalise – scale reference is degenerate.
        return {
            "thumb_index_distance": None,
            "index_middle_distance": None,
            "thumb_index_over_palm": None,
            "index_middle_over_palm": None,
            "palm_width": palm_width,
            "middle_below_index": 1.0 if middle_tip[1] > index_tip[1] else 0.0,
        }

    thumb_index_dist = _euclidean_3d(thumb_tip, index_tip) / palm_width
    index_middle_dist = _euclidean_3d(index_tip, middle_tip) / palm_width

    return {
        "thumb_index_distance": thumb_index_dist,
        "index_middle_distance": index_middle_dist,
        "thumb_index_over_palm": thumb_index_dist,
        "index_middle_over_palm": index_middle_dist,
        "palm_width": palm_width,
        "middle_below_index": 1.0 if middle_tip[1] > index_tip[1] else 0.0,
    }
