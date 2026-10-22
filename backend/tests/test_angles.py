"""
Comprehensive tests for SkillSync angle computation utilities.

Covers:
  - Reference angles with synthetic 3D points
  - Degenerate / edge cases (zero-length vectors, coincident points)
  - Invalid input handling (NaN, Inf, short lists)
  - compute_angles with missing / insufficient landmarks
  - compute_angles with valid 21 landmarks & landmark-mapping verification
"""

import math
import sys
import os

import pytest

# ---------------------------------------------------------------------------
# Path setup – allow pytest to import the backend application package
# regardless of the working directory.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.features.hand_tracking.feature_engineering.angles import (
    calculate_angle_3d,
    compute_angles,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ANGLE_METRICS = [
    "index_mcp_angle",
    "index_pip_angle",
    "index_dip_angle",
    "thumb_index_angle",
    "wrist_finger_angle",
    "wrist_index_angle",
    "index_middle_alignment",
]


def _flat_hand_landmarks() -> list[list[float]]:
    """Return 21 synthetic landmarks arranged as a simple flat hand.

    Layout (all z = 0):
      - Wrist (0) at origin.
      - Each finger extends upward (positive y) from its MCP, spaced along x.
      - Joints within a finger are evenly spaced along y.

    This ensures every triplet of consecutive joints forms a 180° (straight)
    angle along the finger, and cross-finger angles are well-defined.
    """
    landmarks: list[list[float]] = [[0.0, 0.0, 0.0]] * 21  # pre-fill

    # Helper: generate 4 landmarks for a finger starting at (x, y_start)
    def finger(x: float, y_start: float, spacing: float = 0.05):
        return [
            [x, y_start, 0.0],               # MCP
            [x, y_start + spacing, 0.0],      # PIP
            [x, y_start + 2 * spacing, 0.0],  # DIP
            [x, y_start + 3 * spacing, 0.0],  # Tip
        ]

    # Wrist
    landmarks[0] = [0.0, 0.0, 0.0]

    # Thumb (indices 1-4) – slightly offset
    landmarks[1] = [-0.05, 0.02, 0.0]   # CMC
    landmarks[2] = [-0.08, 0.05, 0.0]   # MCP
    landmarks[3] = [-0.10, 0.09, 0.0]   # IP
    landmarks[4] = [-0.12, 0.13, 0.0]   # Tip

    # Index (5-8)
    idx = finger(-0.03, 0.10)
    landmarks[5], landmarks[6], landmarks[7], landmarks[8] = idx

    # Middle (9-12)
    mid = finger(0.00, 0.11)
    landmarks[9], landmarks[10], landmarks[11], landmarks[12] = mid

    # Ring (13-16)
    rng = finger(0.03, 0.10)
    landmarks[13], landmarks[14], landmarks[15], landmarks[16] = rng

    # Pinky (17-20)
    pnk = finger(0.06, 0.09)
    landmarks[17], landmarks[18], landmarks[19], landmarks[20] = pnk

    return landmarks


# ===================================================================
# 1. Reference angles with synthetic 3D points  (tolerance ±0.01°)
# ===================================================================

class TestCalculateAngle3DReferenceAngles:
    """Verify well-known angles computed from simple 3D coordinates."""

    TIGHT = 0.01  # degrees

    def test_90_degrees(self):
        result = calculate_angle_3d([1, 0, 0], [0, 0, 0], [0, 1, 0])
        assert result == pytest.approx(90.0, abs=self.TIGHT)

    def test_180_degrees(self):
        result = calculate_angle_3d([-1, 0, 0], [0, 0, 0], [1, 0, 0])
        assert result == pytest.approx(180.0, abs=self.TIGHT)

    def test_60_degrees(self):
        result = calculate_angle_3d(
            [1, 0, 0], [0, 0, 0], [0.5, math.sqrt(3) / 2, 0]
        )
        assert result == pytest.approx(60.0, abs=self.TIGHT)

    def test_30_degrees(self):
        result = calculate_angle_3d(
            [1, 0, 0],
            [0, 0, 0],
            [math.cos(math.radians(30)), math.sin(math.radians(30)), 0],
        )
        assert result == pytest.approx(30.0, abs=self.TIGHT)

    def test_120_degrees(self):
        result = calculate_angle_3d(
            [1, 0, 0],
            [0, 0, 0],
            [math.cos(math.radians(120)), math.sin(math.radians(120)), 0],
        )
        assert result == pytest.approx(120.0, abs=self.TIGHT)

    def test_0_degrees_collinear_same_direction(self):
        result = calculate_angle_3d([2, 0, 0], [0, 0, 0], [1, 0, 0])
        assert result == pytest.approx(0.0, abs=self.TIGHT)

    def test_45_degrees_in_3d(self):
        result = calculate_angle_3d([1, 0, 0], [0, 0, 0], [1, 1, 0])
        assert result == pytest.approx(45.0, abs=self.TIGHT)


# ===================================================================
# 2. Degenerate cases
# ===================================================================

class TestCalculateAngle3DDegenerateCases:
    """Edge cases that should gracefully return None."""

    def test_zero_length_vector_p1_equals_p2(self):
        """When p1 == p2 the vector A−B is zero-length → None."""
        result = calculate_angle_3d([0, 0, 0], [0, 0, 0], [0, 0, 1])
        assert result is None

    def test_all_three_points_coincident(self):
        result = calculate_angle_3d([0, 0, 0], [0, 0, 0], [0, 0, 0])
        assert result is None

    def test_near_zero_vector(self):
        """Vector length ≈ 1e-10 should be treated as degenerate."""
        result = calculate_angle_3d([0, 0, 0], [0, 0, 0], [0, 0, 1e-10])
        assert result is None


# ===================================================================
# 3. Invalid input
# ===================================================================

class TestCalculateAngle3DInvalidInput:
    """Malformed or non-finite coordinates should return None."""

    def test_nan_in_coordinates(self):
        result = calculate_angle_3d([float("nan"), 0, 0], [0, 0, 0], [0, 1, 0])
        assert result is None

    def test_infinity_in_coordinates(self):
        result = calculate_angle_3d([float("inf"), 0, 0], [0, 0, 0], [0, 1, 0])
        assert result is None

    def test_short_list(self):
        """Lists with fewer than 3 elements should return None."""
        result = calculate_angle_3d([1, 0], [0, 0, 0], [0, 1, 0])
        assert result is None


# ===================================================================
# 4. compute_angles with missing landmarks
# ===================================================================

class TestComputeAnglesMissingLandmarks:
    """When landmarks are absent or insufficient, every value must be None."""

    def test_empty_list(self):
        result = compute_angles([])
        assert all(v is None for v in result.values()), (
            "All angle values must be None for an empty landmark list"
        )

    def test_fewer_than_21_landmarks(self):
        # Supply only 10 landmarks – well below the required 21.
        partial = [[0.0, 0.0, 0.0]] * 10
        result = compute_angles(partial)
        assert all(v is None for v in result.values()), (
            "All angle values must be None when fewer than 21 landmarks are provided"
        )

    def test_never_returns_zero_for_missing_data(self):
        """0.0 is a valid measurement; missing data must be None, not 0."""
        for landmarks_input in [[], [[0.0, 0.0, 0.0]] * 5]:
            result = compute_angles(landmarks_input)
            for key, value in result.items():
                assert value is None, (
                    f"{key} should be None for missing data, got {value}"
                )


# ===================================================================
# 5. compute_angles with valid 21 landmarks
# ===================================================================

class TestComputeAnglesValidLandmarks:
    """Verify output structure and correct landmark triplet usage."""

    @pytest.fixture()
    def flat_hand(self):
        return _flat_hand_landmarks()

    @pytest.fixture()
    def angles(self, flat_hand):
        return compute_angles(flat_hand)

    # ---- Structure checks ----

    def test_returns_dict(self, angles):
        assert isinstance(angles, dict)

    def test_contains_all_angle_keys(self, angles):
        for key in ANGLE_METRICS:
            assert key in angles, f"Missing key: {key}"

    def test_values_are_float_or_none(self, angles):
        for key, value in angles.items():
            assert value is None or isinstance(value, float), (
                f"{key} must be float or None, got {type(value).__name__}"
            )

    def test_no_zero_for_valid_nonzero_geometry(self, angles):
        """With the flat-hand layout every angle should be a positive float
        (none of the triplets are collinear in the same direction)."""
        for key in ANGLE_METRICS:
            val = angles[key]
            if val is not None:
                assert val > 0.0, (
                    f"{key} should be > 0 for the flat-hand layout, got {val}"
                )

    # ---- Correct triplet checks ----

    def test_index_mcp_angle_uses_landmarks_0_5_6(self, flat_hand, angles):
        """index_mcp_angle must use landmarks [0, 5, 6], NOT [4, 5, 6]."""
        expected = calculate_angle_3d(
            flat_hand[0], flat_hand[5], flat_hand[6]
        )
        assert angles["index_mcp_angle"] == pytest.approx(expected, abs=0.01)

    def test_index_pip_angle_uses_landmarks_5_6_7(self, flat_hand, angles):
        expected = calculate_angle_3d(
            flat_hand[5], flat_hand[6], flat_hand[7]
        )
        assert angles["index_pip_angle"] == pytest.approx(expected, abs=0.01)

    def test_index_dip_angle_uses_landmarks_6_7_8(self, flat_hand, angles):
        expected = calculate_angle_3d(
            flat_hand[6], flat_hand[7], flat_hand[8]
        )
        assert angles["index_dip_angle"] == pytest.approx(expected, abs=0.01)


# ===================================================================
# 6. Landmark mapping verification
# ===================================================================

class TestLandmarkMappingVerification:
    """Prove that index_mcp_angle uses landmark 0 (wrist), NOT landmark 4
    (thumb tip), by placing them at distinct positions and verifying the
    computed angle matches the manual calculation with [0, 5, 6]."""

    def test_index_mcp_uses_wrist_not_thumb_tip(self):
        landmarks = _flat_hand_landmarks()

        # Move wrist (0) and thumb tip (4) to clearly different positions.
        landmarks[0] = [0.0, 0.0, 0.0]      # wrist at origin
        landmarks[4] = [1.0, 1.0, 1.0]      # thumb tip far away

        # Keep index MCP (5) and index PIP (6) fixed from the flat hand.
        # Manually compute the expected angle using landmarks [0, 5, 6].
        expected_with_wrist = calculate_angle_3d(
            landmarks[0], landmarks[5], landmarks[6]
        )
        # Compute what it WOULD be if the function mistakenly used [4, 5, 6].
        wrong_with_thumb_tip = calculate_angle_3d(
            landmarks[4], landmarks[5], landmarks[6]
        )

        result = compute_angles(landmarks)

        # The result must match the wrist-based calculation.
        assert result["index_mcp_angle"] is not None
        assert result["index_mcp_angle"] == pytest.approx(
            expected_with_wrist, abs=0.01
        ), (
            "index_mcp_angle should use landmark 0 (wrist), "
            "not landmark 4 (thumb tip)"
        )

        # Extra safety: confirm the two reference values actually differ,
        # so the test is meaningful.
        assert expected_with_wrist != pytest.approx(
            wrong_with_thumb_tip, abs=0.1
        ), (
            "Test setup error: wrist-based and thumb-tip-based angles are "
            "too similar to distinguish; adjust landmark positions."
        )
