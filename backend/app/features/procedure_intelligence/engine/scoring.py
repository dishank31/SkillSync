"""
Real-Time Multimodal Step Scorer & NLI Verbal-Motor Entailment (CCNLP NLP Pillar 2).

Integrates CrossEncoder("cross-encoder/nli-deberta-v3-small") to compute NLI entailment
probabilities between live Think-Aloud spoken callouts (Premise) and canonical SOP step hypotheses.
Combines verbal semantics with 3D metric joint angle compliance to categorize the learner's
Cognitive-Motor Alignment State.
"""

from __future__ import annotations

import logging
import math
import re
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from app.core.settings import get_settings

logger = logging.getLogger(__name__)


# ── Backward-compatible legacy helper ──────────────────────────────────────────

def compute_score(*, valid: bool, stability: float) -> float:
    """Overall score derived from constraint validity and rolling stability."""
    s = float(stability)
    if s < 0.0:
        s = 0.0
    if s > 1.0:
        s = 1.0
    return s if bool(valid) else (0.25 * s)


# ── Cognitive-Motor Alignment States ───────────────────────────────────────────

class CognitiveMotorState(str, Enum):
    SYNCHRONIZED_MASTERY = "SYNCHRONIZED_MASTERY"
    MOTOR_EXECUTION_DRIFT = "MOTOR_EXECUTION_DRIFT"
    COGNITIVE_PROTOCOL_CONTRADICTION = "COGNITIVE_PROTOCOL_CONTRADICTION"
    SEMANTIC_HESITATION_OR_OMISSION = "SEMANTIC_HESITATION_OR_OMISSION"
    DUAL_PATHWAY_FAILURE = "DUAL_PATHWAY_FAILURE"


class NLIProbabilities(BaseModel):
    p_entailment: float = 0.0
    p_neutral: float = 1.0
    p_contradiction: float = 0.0


class MultimodalScoreResult(BaseModel):
    alignment_state: CognitiveMotorState
    nli_probabilities: NLIProbabilities
    kinematic_score: float
    joint_residuals: Dict[str, float] = Field(default_factory=dict)
    joint_compliance: Dict[str, bool] = Field(default_factory=dict)
    stability_score: float
    utterance_latency_sec: float
    composite_score: float
    feedback_message: str = ""


# ── MultimodalStepScorer ───────────────────────────────────────────────────────

class MultimodalStepScorer:
    """Singleton NLI-based Verbal-Motor Multimodal Scorer."""

    _instance: Optional["MultimodalStepScorer"] = None

    def __init__(self, model_name: Optional[str] = None):
        self.settings = get_settings()
        self.model_name = model_name or self.settings.nli_model_name
        self._cross_encoder = None
        self._load_failed = False

    @classmethod
    def get_instance(cls) -> "MultimodalStepScorer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_model(self):
        if self._cross_encoder is None and not self._load_failed:
            try:
                from sentence_transformers import CrossEncoder
                logger.info(f"Loading CrossEncoder NLI model: {self.model_name}")
                self._cross_encoder = CrossEncoder(self.model_name)
                logger.info(f"Successfully loaded CrossEncoder: {self.model_name}")
            except Exception as e:
                logger.warning(f"Could not load CrossEncoder ({e}); falling back to heuristic NLI.")
                self._load_failed = True
        return self._cross_encoder

    def compute_nli(self, premise: Optional[str], hypothesis: str) -> NLIProbabilities:
        """Compute P(Entailment), P(Neutral), P(Contradiction) between spoken premise and step hypothesis.

        DeBERTa-v3 NLI label mapping:
          index 0: contradiction
          index 1: entailment
          index 2: neutral
        """
        if not premise or not premise.strip():
            # Spoken utterance omitted
            return NLIProbabilities(p_entailment=0.0, p_neutral=1.0, p_contradiction=0.0)

        clean_premise = premise.strip()
        clean_hyp = hypothesis.strip()

        model = self._get_model()
        if model is not None:
            try:
                # Predict returns logits
                logits = model.predict([(clean_premise, clean_hyp)])[0]
                # Softmax
                max_l = max(logits)
                exps = [math.exp(x - max_l) for x in logits]
                sum_exps = sum(exps) + 1e-12
                probs = [e / sum_exps for e in exps]

                p_contra = round(probs[0], 4)
                p_entail = round(probs[1], 4)
                p_neut = round(probs[2], 4)
                return NLIProbabilities(
                    p_entailment=p_entail,
                    p_neutral=p_neut,
                    p_contradiction=p_contra,
                )
            except Exception as e:
                logger.warning(f"NLI cross-encoder evaluation error: {e}")

        # Heuristic lexical fallback
        return self._heuristic_nli(clean_premise, clean_hyp)

    def _heuristic_nli(self, premise: str, hypothesis: str) -> NLIProbabilities:
        """Lightweight lexical / keyword NLI fallback when offline."""
        p_lower = premise.lower()
        h_lower = hypothesis.lower()

        # Contradiction cues
        contra_words = ["don't", "not", "never", "wrong", "inverted", "opposite", "bad", "incorrect"]
        if any(w in p_lower for w in contra_words):
            return NLIProbabilities(p_entailment=0.05, p_neutral=0.20, p_contradiction=0.75)

        # Token overlap
        p_tokens = set(re.findall(r"\w+", p_lower))
        h_tokens = set(re.findall(r"\w+", h_lower))
        stop_words = {"the", "a", "an", "i", "am", "is", "at", "in", "to", "with", "my", "and", "of"}
        p_meaningful = p_tokens - stop_words
        h_meaningful = h_tokens - stop_words

        if not h_meaningful or not p_meaningful:
            return NLIProbabilities(p_entailment=0.1, p_neutral=0.8, p_contradiction=0.1)

        overlap = len(p_meaningful & h_meaningful) / float(len(h_meaningful))

        if overlap >= 0.5:
            p_entail = min(0.95, 0.40 + 0.60 * overlap)
            p_contra = 0.03
            p_neut = max(0.02, 1.0 - p_entail - p_contra)
        elif overlap >= 0.25:
            p_entail = 0.40
            p_neut = 0.55
            p_contra = 0.05
        else:
            p_entail = 0.15
            p_neut = 0.75
            p_contra = 0.10

        return NLIProbabilities(
            p_entailment=round(p_entail, 4),
            p_neutral=round(p_neut, 4),
            p_contradiction=round(p_contra, 4),
        )

    def compute_kinematic_compliance(
        self,
        joint_angles: Dict[str, float],
        target_bounds: Dict[str, Tuple[float, float]],
    ) -> Tuple[float, Dict[str, float], Dict[str, bool]]:
        """Compute weighted kinematic compliance score in [0.0, 1.0], signed residuals, and compliance flags.

        Signed residual: delta_theta = actual_deg - target_mid_deg
        """
        if not target_bounds:
            return 1.0, {}, {}

        scores: List[float] = []
        residuals: Dict[str, float] = {}
        compliance: Dict[str, bool] = {}

        for joint, (min_deg, max_deg) in target_bounds.items():
            actual = joint_angles.get(joint)
            mid = 0.5 * (min_deg + max_deg)

            if actual is None:
                scores.append(0.0)
                residuals[joint] = 0.0
                compliance[joint] = False
                continue

            residuals[joint] = round(actual - mid, 2)

            if min_deg <= actual <= max_deg:
                scores.append(1.0)
                compliance[joint] = True
            else:
                # Continuous distance degradation
                dev = (min_deg - actual) if actual < min_deg else (actual - max_deg)
                score_j = max(0.0, 1.0 - (dev / 20.0))
                scores.append(score_j)
                compliance[joint] = False

        kinematic_score = sum(scores) / max(1, len(scores))
        return round(kinematic_score, 4), residuals, compliance

    def score_step(
        self,
        *,
        spoken_utterance: Optional[str],
        step_hypothesis: str,
        joint_angles: Dict[str, float],
        target_bounds: Dict[str, Tuple[float, float]],
        stability_score: float = 1.0,
        utterance_latency_sec: float = 0.0,
    ) -> MultimodalScoreResult:
        """Score multimodal performance aligning Think-Aloud verbal callout with 3D joint posture.

        Determines CognitiveMotorState:
          - SYNCHRONIZED_MASTERY: P(Entailment) >= 0.72 AND kinematic_score >= 0.80
          - MOTOR_EXECUTION_DRIFT: P(Entailment) >= 0.72 AND kinematic_score < 0.80
          - COGNITIVE_PROTOCOL_CONTRADICTION: P(Contradiction) >= 0.55 AND kinematic_score >= 0.80
          - SEMANTIC_HESITATION_OR_OMISSION: No utterance or P(Neutral) > 0.65 while holding pose
          - DUAL_PATHWAY_FAILURE: Both NLI and kinematic checks fail.
        """
        # 1. NLI Inference
        nli = self.compute_nli(spoken_utterance, step_hypothesis)

        # 2. Kinematic Compliance
        kinematic_score, residuals, compliance = self.compute_kinematic_compliance(
            joint_angles, target_bounds
        )

        # 3. Determine Cognitive-Motor Alignment State
        p_entail = nli.p_entailment
        p_contra = nli.p_contradiction
        p_neut = nli.p_neutral
        has_utterance = bool(spoken_utterance and spoken_utterance.strip())

        if p_entail >= 0.72 and kinematic_score >= 0.80:
            state = CognitiveMotorState.SYNCHRONIZED_MASTERY
        elif p_entail >= 0.72 and kinematic_score < 0.80:
            state = CognitiveMotorState.MOTOR_EXECUTION_DRIFT
        elif p_contra >= 0.55 and kinematic_score >= 0.80:
            state = CognitiveMotorState.COGNITIVE_PROTOCOL_CONTRADICTION
        elif (not has_utterance or p_neut > 0.65) and kinematic_score >= 0.70:
            state = CognitiveMotorState.SEMANTIC_HESITATION_OR_OMISSION
        else:
            state = CognitiveMotorState.DUAL_PATHWAY_FAILURE

        # 4. Composite score: 60% Kinematics & Stability, 40% Cognitive Verbal Entailment
        composite = 0.60 * (kinematic_score * float(stability_score)) + 0.40 * p_entail

        return MultimodalScoreResult(
            alignment_state=state,
            nli_probabilities=nli,
            kinematic_score=kinematic_score,
            joint_residuals=residuals,
            joint_compliance=compliance,
            stability_score=round(float(stability_score), 4),
            utterance_latency_sec=round(float(utterance_latency_sec), 2),
            composite_score=round(max(0.0, min(1.0, composite)), 4),
        )


def get_nli_scorer() -> MultimodalStepScorer:
    """Return the singleton MultimodalStepScorer instance."""
    return MultimodalStepScorer.get_instance()

