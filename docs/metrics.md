# SkillSync – Metric Definitions

> [!NOTE]
> This document defines every metric computed by the SkillSync hand-tracking pipeline.
> All metrics are derived from [MediaPipe Hand Landmarks](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) detected in webcam frames.

---

## MediaPipe Hand Landmark Reference

| Index | Landmark          | Index | Landmark          |
|------:|-------------------|------:|-------------------|
|     0 | Wrist             |    11 | Middle DIP        |
|     1 | Thumb CMC         |    12 | Middle Tip        |
|     2 | Thumb MCP         |    13 | Ring MCP          |
|     3 | Thumb IP          |    14 | Ring PIP          |
|     4 | Thumb Tip         |    15 | Ring DIP          |
|     5 | Index MCP         |    16 | Ring Tip          |
|     6 | Index PIP         |    17 | Pinky MCP         |
|     7 | Index DIP         |    18 | Pinky PIP         |
|     8 | Index Tip         |    19 | Pinky DIP         |
|     9 | Middle MCP        |    20 | Pinky Tip         |
|    10 | Middle PIP        |       |                   |

---

## 1  Angle Metrics

### Formula

All angles are computed with the standard 3-point formula where **B** is the vertex (joint):

```
θ = arccos( (A − B) · (C − B)  /  (|A − B| · |C − B|) )
```

* The cosine argument is clamped to **[−1, 1]** before `arccos` to guard against floating-point overshoot.
* Returns **`None`** (JSON `null`) if either vector `A − B` or `C − B` has near-zero length, or if any input coordinate is invalid (NaN, Inf, missing).

### Metric Table

| Metric | Landmarks [A, B, C] | Definition | Unit |
|---|---|---|---|
| `index_mcp_angle` | [0, 5, 6] | Angle at the Index MCP joint: Wrist → Index MCP → Index PIP | degrees |
| `index_pip_angle` | [5, 6, 7] | Angle at the Index PIP joint: Index MCP → Index PIP → Index DIP | degrees |
| `index_dip_angle` | [6, 7, 8] | Angle at the Index DIP joint: Index PIP → Index DIP → Index Tip | degrees |
| `thumb_index_angle` | [4, 0, 8] | Angle at the Wrist between Thumb Tip and Index Tip | degrees |
| `wrist_finger_angle` | [0, 9, 12] | Angle at Middle MCP: Wrist → Middle MCP → Middle Tip | degrees |
| `wrist_index_angle` | [0, 5, 8] | Angle at Index MCP: Wrist → Index MCP → Index Tip (tool orientation proxy) | degrees |
| `index_middle_alignment` | [5, 8, 12] | Angle at Index Tip: Index MCP → Index Tip → Middle Tip | degrees |

---

## 2  Distance Metrics

| Metric | Landmarks | Definition | Unit |
|---|---|---|---|
| `thumb_index_distance` | [4, 8] | Euclidean distance between Thumb Tip and Index Tip | normalized (÷ `palm_width`) |
| `index_middle_distance` | [8, 12] | Euclidean distance between Index Tip and Middle Tip | normalized (÷ `palm_width`) |
| `palm_width` | [5, 17] | Euclidean distance between Index MCP and Pinky MCP. Used as scale reference. | raw MediaPipe coords |

---

## 3  Important Notes

> [!IMPORTANT]
> 1. **Scale invariance** – All distance metrics (except `palm_width` itself) are divided by `palm_width` so that measurements are independent of how close the hand is to the camera.
> 2. **Z-coordinate caveat** – MediaPipe's `z` value is a *relative depth estimate* produced by the model. It is **not** calibrated depth in centimetres. Do not interpret differences in `z` as real-world distances.
> 3. **Null vs. zero** – Missing or invalid measurements are returned as `None` (JSON `null`), **never** as `0`. A value of `0` represents a genuine measurement of zero degrees or zero distance.
> 4. **Visual-only assessment** – The webcam-based system measures visual hand technique only. It **cannot** verify temperature, electrical safety, contact force, solder joint quality, or any other non-visual property.

---

## 4  Detection States

The pipeline classifies each frame into one of the following detection states:

| State | Description |
|---|---|
| `no_hand` | No hand detected in the frame. |
| `hand_detected` | Hand detected with sufficient confidence for metric computation. |
| `partial_or_unreliable` | Hand partially detected or detection confidence is below the acceptance threshold. |
| `tracking_recovered` | Hand re-detected after a period of tracking loss. |

---

## 5  Frame Classification

Each frame's landmarks receive one of two classifications that determines how they are used downstream:

| Classification | Description |
|---|---|
| `observed` | Landmarks come from an actual MediaPipe detection in this frame. These are used for scoring and timer computation. |
| `stale` | The last known landmarks are retained for visualisation only after tracking has been lost. Stale landmarks are **excluded** from scoring and timer calculations. |

> [!WARNING]
> Never use `stale` landmarks for metric aggregation or skill assessment. They exist solely so the UI can continue to render a hand overlay while the tracker attempts to re-acquire the hand.
