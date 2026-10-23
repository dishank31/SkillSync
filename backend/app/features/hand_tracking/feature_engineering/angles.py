"""
Joint angle computation from 3D metric hand landmarks.

All angles are computed on metric 3D world coordinates using:
    theta_deg = degrees(arccos(clip(dot(u, v) / (norm(u) * norm(v) + 1e-8), -1.0, 1.0)))
where vertex B is the joint center, and u = A - B, v = C - B.
"""

from __future__ import annotations

import math
from typing import Optional


def calculate_angle_3d(
    p1: list[float] | tuple[float, ...],
    p2: list[float] | tuple[float, ...],
    p3: list[float] | tuple[float, ...],
) -> Optional[float]:
    """Calculate the 3D angle (degrees) at vertex *p2* formed by rays p2→p1 and p2→p3.

    Args:
        p1: First endpoint [x, y, z].
        p2: Vertex (joint center) [x, y, z].
        p3: Second endpoint [x, y, z].

    Returns:
        Angle in degrees in [0.0, 180.0], or None if points are non-finite or coincident.
    """
    for point in (p1, p2, p3):
        if len(point) < 3 or not all(math.isfinite(v) for v in point[:3]):
            return None

    u = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    v = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]]

    dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    norm_u = math.sqrt(u[0] ** 2 + u[1] ** 2 + u[2] ** 2)
    norm_v = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)

    if norm_u <= 1e-6 or norm_v <= 1e-6:
        return None

    denom = (norm_u * norm_v) + 1e-8
    cos_theta = max(-1.0, min(1.0, dot / denom))
    return math.degrees(math.acos(cos_theta))


def compute_angles(landmarks: list[list[float]]) -> dict[str, Optional[float]]:
    """Compute all tracked 3D joint flexion angles from 21 hand landmarks.

    Computes:
        INDEX_MCP, INDEX_PIP, INDEX_DIP
        MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP
        RING_PIP, PINKY_PIP
        THUMB_CMC, THUMB_MCP, THUMB_IP
        WRIST_FLEXION / WRIST_INDEX
    Includes all backward-compatible aliases.
    """
    all_keys = [
        "INDEX_MCP",
        "INDEX_PIP",
        "INDEX_DIP",
        "MIDDLE_MCP",
        "MIDDLE_PIP",
        "MIDDLE_DIP",
        "RING_PIP",
        "PINKY_PIP",
        "THUMB_CMC",
        "THUMB_MCP",
        "THUMB_IP",
        "WRIST_FLEXION",
        "index_mcp_angle",
        "index_pip_angle",
        "index_dip_angle",
        "thumb_index_angle",
        "wrist_finger_angle",
        "wrist_index_angle",
        "index_middle_alignment",
        "mcp_joint",
        "pip_joint",
    ]

    if not landmarks or len(landmarks) < 21:
        return {k: None for k in all_keys}

    # Primary Flexion Angles
    idx_mcp = calculate_angle_3d(landmarks[0], landmarks[5], landmarks[6])
    idx_pip = calculate_angle_3d(landmarks[5], landmarks[6], landmarks[7])
    idx_dip = calculate_angle_3d(landmarks[6], landmarks[7], landmarks[8])

    mid_mcp = calculate_angle_3d(landmarks[0], landmarks[9], landmarks[10])
    mid_pip = calculate_angle_3d(landmarks[9], landmarks[10], landmarks[11])
    mid_dip = calculate_angle_3d(landmarks[10], landmarks[11], landmarks[12])

    ring_pip = calculate_angle_3d(landmarks[13], landmarks[14], landmarks[15])
    pinky_pip = calculate_angle_3d(landmarks[17], landmarks[18], landmarks[19])

    thumb_cmc = calculate_angle_3d(landmarks[0], landmarks[1], landmarks[2])
    thumb_mcp = calculate_angle_3d(landmarks[1], landmarks[2], landmarks[3])
    thumb_ip = calculate_angle_3d(landmarks[2], landmarks[3], landmarks[4])

    wrist_flexion = calculate_angle_3d(landmarks[1], landmarks[0], landmarks[9])
    thumb_idx = calculate_angle_3d(landmarks[4], landmarks[0], landmarks[8])
    wrist_finger = calculate_angle_3d(landmarks[0], landmarks[9], landmarks[12])
    wrist_index = calculate_angle_3d(landmarks[0], landmarks[5], landmarks[8])
    idx_mid_align = calculate_angle_3d(landmarks[5], landmarks[8], landmarks[12])

    return {
        # Canonical Uppercase 3D Metric Angles
        "INDEX_MCP": idx_mcp,
        "INDEX_PIP": idx_pip,
        "INDEX_DIP": idx_dip,
        "MIDDLE_MCP": mid_mcp,
        "MIDDLE_PIP": mid_pip,
        "MIDDLE_DIP": mid_dip,
        "RING_PIP": ring_pip,
        "PINKY_PIP": pinky_pip,
        "THUMB_CMC": thumb_cmc,
        "THUMB_MCP": thumb_mcp,
        "THUMB_IP": thumb_ip,
        "WRIST_FLEXION": wrist_flexion,
        # Backward-compatible lowercase aliases
        "index_mcp_angle": idx_mcp,
        "index_pip_angle": idx_pip,
        "index_dip_angle": idx_dip,
        "thumb_index_angle": thumb_idx,
        "wrist_finger_angle": wrist_finger,
        "wrist_index_angle": wrist_index,
        "index_middle_alignment": idx_mid_align,
        "mcp_joint": idx_mcp,
        "pip_joint": idx_pip,
    }
