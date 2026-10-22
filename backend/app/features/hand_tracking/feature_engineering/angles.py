"""
Joint angle computation from 3D hand landmarks.

All angles use:
    θ = arccos( (A−B)·(C−B) / (|A−B|·|C−B|) )
where B is the joint (vertex), A and C are adjacent landmarks.
Cosine is clamped to [-1, 1].

Returns ``None`` (not 0) when:
- Input landmarks are missing or insufficient (< 21).
- Either vector has near-zero length (degenerate / coincident points).
- Any input coordinate is non-finite.

Landmark index reference (MediaPipe Hand):
    0  Wrist
    1  Thumb CMC   5  Index MCP    9  Middle MCP  13 Ring MCP   17 Pinky MCP
    2  Thumb MCP   6  Index PIP   10  Middle PIP  14 Ring PIP   18 Pinky PIP
    3  Thumb IP    7  Index DIP   11  Middle DIP  15 Ring DIP   19 Pinky DIP
    4  Thumb Tip   8  Index Tip   12  Middle Tip  16 Ring Tip   20 Pinky Tip

See docs/metrics.md for the full metric catalog.
"""

import math
from typing import Optional

# Minimum vector magnitude to consider non-degenerate.
_MIN_VECTOR_LENGTH: float = 1e-7


def calculate_angle_3d(
    p1: list[float],
    p2: list[float],
    p3: list[float],
) -> Optional[float]:
    """Calculate the angle (degrees) at vertex *p2* formed by rays p2→p1 and p2→p3.

    Args:
        p1: First endpoint [x, y, z].
        p2: Vertex (joint) [x, y, z].
        p3: Second endpoint [x, y, z].

    Returns:
        Angle in degrees ∈ [0, 180], or ``None`` if inputs are
        invalid or degenerate (zero-length vector).
    """
    for point in (p1, p2, p3):
        if len(point) < 3 or not all(math.isfinite(v) for v in point[:3]):
            return None

    v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]]

    dot_prod = sum(v1[i] * v2[i] for i in range(3))
    mag1 = math.sqrt(sum(v1[i] ** 2 for i in range(3)))
    mag2 = math.sqrt(sum(v2[i] ** 2 for i in range(3)))

    if mag1 < _MIN_VECTOR_LENGTH or mag2 < _MIN_VECTOR_LENGTH:
        return None

    cos_angle = max(-1.0, min(1.0, dot_prod / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))


def compute_angles(landmarks: list[list[float]]) -> dict[str, Optional[float]]:
    """Compute all tracked joint angles from 21 hand landmarks.

    Landmark mapping (joint at the middle point):
        index_mcp_angle:        0 (wrist)     → 5 (MCP) → 6 (PIP)
        index_pip_angle:        5 (MCP)       → 6 (PIP) → 7 (DIP)
        index_dip_angle:        6 (PIP)       → 7 (DIP) → 8 (Tip)
        thumb_index_angle:      4 (thumb tip) → 0 (wrist) → 8 (index tip)
        wrist_finger_angle:     0 (wrist)     → 9 (mid MCP) → 12 (mid tip)
        wrist_index_angle:      0 (wrist)     → 5 (idx MCP) → 8 (idx tip)
        index_middle_alignment: 5 (idx MCP)   → 8 (idx tip) → 12 (mid tip)

    Returns:
        Dict mapping metric name → angle in degrees, or ``None``
        when the measurement is invalid / unavailable.
    """
    _none: dict[str, Optional[float]] = {
        "index_mcp_angle": None,
        "index_pip_angle": None,
        "index_dip_angle": None,
        "thumb_index_angle": None,
        "wrist_finger_angle": None,
        "wrist_index_angle": None,
        "index_middle_alignment": None,
        # Backward-compatible aliases
        "mcp_joint": None,
        "pip_joint": None,
    }

    if not landmarks or len(landmarks) < 21:
        return dict(_none)

    idx_mcp = calculate_angle_3d(landmarks[0], landmarks[5], landmarks[6])
    idx_pip = calculate_angle_3d(landmarks[5], landmarks[6], landmarks[7])
    idx_dip = calculate_angle_3d(landmarks[6], landmarks[7], landmarks[8])
    thumb_idx = calculate_angle_3d(landmarks[4], landmarks[0], landmarks[8])
    wrist_mid = calculate_angle_3d(landmarks[0], landmarks[9], landmarks[12])
    wrist_idx = calculate_angle_3d(landmarks[0], landmarks[5], landmarks[8])
    idx_mid_align = calculate_angle_3d(landmarks[5], landmarks[8], landmarks[12])

    return {
        "index_mcp_angle": idx_mcp,
        "index_pip_angle": idx_pip,
        "index_dip_angle": idx_dip,
        "thumb_index_angle": thumb_idx,
        "wrist_finger_angle": wrist_mid,
        "wrist_index_angle": wrist_idx,
        "index_middle_alignment": idx_mid_align,
        # Aliases for backwards compatibility with existing step schemas & tests
        "mcp_joint": idx_mcp,
        "pip_joint": idx_pip,
    }
