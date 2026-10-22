"""
Landmark normalisation: position (wrist-centred) and scale (palm-width).

Translation: subtract wrist position so wrist is at the origin.
Scale: divide by palm width (index MCP → pinky MCP) so results are
independent of the hand's distance from the camera.
"""

from __future__ import annotations

import math


def normalize_landmarks(landmarks: list[list[float]]) -> list[list[float]]:
    """Position- and scale-normalise 21 hand landmarks.

    1. Translate so wrist (landmark 0) is at the origin.
    2. Scale by palm width (Euclidean distance between landmarks 5 and 17).
       If palm width is near zero, only translation is applied.

    Args:
        landmarks: List of 21 [x, y, z] landmark positions.

    Returns:
        Normalised landmarks, or an empty list if input is empty.
    """
    if not landmarks:
        return []

    base_x, base_y, base_z = landmarks[0]

    # Translate to wrist origin.
    translated: list[list[float]] = []
    for x, y, z in landmarks:
        translated.append([x - base_x, y - base_y, z - base_z])

    # Compute palm width for scale normalisation.
    if len(translated) >= 18:
        p5 = translated[5]
        p17 = translated[17]
        palm_width = math.sqrt(
            (p5[0] - p17[0]) ** 2
            + (p5[1] - p17[1]) ** 2
            + (p5[2] - p17[2]) ** 2
        )
    else:
        palm_width = 0.0

    if palm_width < 1e-6:
        # Cannot scale – return translation only.
        return translated

    inv = 1.0 / palm_width
    return [[c[0] * inv, c[1] * inv, c[2] * inv] for c in translated]
