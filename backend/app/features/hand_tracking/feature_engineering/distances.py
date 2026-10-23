"""
3D Scale-invariant distance and pinch metrics from hand landmarks.

Normalizes pinch distances by palm scale norm(landmark[0] - landmark[9])
(wrist to middle-MCP length) so pinch thresholds are camera-distance invariant.
"""

from __future__ import annotations

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
    """Compute scale-invariant distance metrics from 21 3D hand landmarks.

    Metrics returned:
        THUMB_INDEX_PINCH: ||p4 - p8|| / ||p0 - p9|| (camera-distance invariant)
        THUMB_MIDDLE_PINCH: ||p4 - p12|| / ||p0 - p9|| (camera-distance invariant)
        thumb_index_distance: Thumb-tip(4) <-> Index-tip(8), normalized by palm width.
        index_middle_distance: Index-tip(8) <-> Middle-tip(12), normalized by palm width.
        palm_scale: Euclidean distance from wrist(0) to middle-MCP(9).
        palm_width: Euclidean distance from index-MCP(5) to pinky-MCP(17).
        middle_below_index: 1.0 if middle tip y > index tip y (canvas coords), else 0.0.
    """
    _none: dict[str, Optional[float]] = {
        "THUMB_INDEX_PINCH": None,
        "THUMB_MIDDLE_PINCH": None,
        "thumb_index_distance": None,
        "index_middle_distance": None,
        "thumb_index_over_palm": None,
        "index_middle_over_palm": None,
        "palm_scale": None,
        "palm_width": None,
        "middle_below_index": None,
    }

    if not landmarks or len(landmarks) < 21:
        return dict(_none)

    wrist = landmarks[0]
    thumb_tip = landmarks[4]
    index_mcp = landmarks[5]
    index_tip = landmarks[8]
    middle_mcp = landmarks[9]
    middle_tip = landmarks[12]
    pinky_mcp = landmarks[17]

    # Palm length scale (0 -> 9)
    palm_scale = _euclidean_3d(wrist, middle_mcp)
    # Palm width scale (5 -> 17)
    palm_width = _euclidean_3d(index_mcp, pinky_mcp)

    scale_ref = palm_scale if palm_scale > 1e-6 else palm_width

    if scale_ref <= 1e-6:
        return {
            "THUMB_INDEX_PINCH": None,
            "THUMB_MIDDLE_PINCH": None,
            "thumb_index_distance": None,
            "index_middle_distance": None,
            "thumb_index_over_palm": None,
            "index_middle_over_palm": None,
            "palm_scale": palm_scale,
            "palm_width": palm_width,
            "middle_below_index": 1.0 if middle_tip[1] > index_tip[1] else 0.0,
        }

    # Normalized by palm length scale (norm(0 - 9))
    thumb_idx_pinch = _euclidean_3d(thumb_tip, index_tip) / scale_ref
    thumb_mid_pinch = _euclidean_3d(thumb_tip, middle_tip) / scale_ref

    # Normalized by palm width (for existing tests compatibility)
    width_ref = palm_width if palm_width > 1e-6 else scale_ref
    thumb_idx_width = _euclidean_3d(thumb_tip, index_tip) / width_ref
    idx_mid_width = _euclidean_3d(index_tip, middle_tip) / width_ref

    return {
        "THUMB_INDEX_PINCH": thumb_idx_pinch,
        "THUMB_MIDDLE_PINCH": thumb_mid_pinch,
        "thumb_index_distance": thumb_idx_width,
        "index_middle_distance": idx_mid_width,
        "thumb_index_over_palm": thumb_idx_width,
        "index_middle_over_palm": idx_mid_width,
        "palm_scale": palm_scale,
        "palm_width": palm_width,
        "middle_below_index": 1.0 if middle_tip[1] > index_tip[1] else 0.0,
    }
