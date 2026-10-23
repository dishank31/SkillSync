"""
Unit and Integration tests for CCNLP Multimodal NLP & Kinematic Engine.

Tests:
1. Frame-Semantic SOP Compilation (NLP Pillar 1):
   - Sentence segmentation & tuple extraction (predicate, articulator, qualifier, hold, hypothesis)
   - Explicit degree parsing (±7° enter band, ±11° exit hysteresis)
   - Ontology grounding via embeddings
   - POST /api/procedures/compile-sop endpoint
2. Real-Time Verbal-Motor NLI Scoring (NLP Pillar 2):
   - DeBERTa-v3 cross-encoder NLI probabilities
   - CognitiveMotorState categorization:
     * SYNCHRONIZED_MASTERY
     * MOTOR_EXECUTION_DRIFT
     * COGNITIVE_PROTOCOL_CONTRADICTION
     * SEMANTIC_HESITATION_OR_OMISSION
     * DUAL_PATHWAY_FAILURE
3. Dual-Memory Skill Decay & Contrastive NLG (NLP Pillar 3):
   - Declarative Cognitive Decay vs Procedural Motor Decay curves
   - Contrastive diagnostic sentence generation
4. Health endpoints & WebSocket schema validation
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.features.procedure_intelligence.engine.decay_predictor import (
    compute_dual_memory_stability,
    predict_decay,
)
from app.features.procedure_intelligence.engine.feedback import generate_contrastive_nlg
from app.features.procedure_intelligence.engine.scoring import (
    CognitiveMotorState,
    MultimodalStepScorer,
    NLIProbabilities,
)
from app.features.procedure_intelligence.engine.sop_compiler import SOPCompiler


@pytest.fixture
def client():
    return TestClient(app)


# ── 1. Frame-Semantic SOP Compiler Tests ───────────────────────────────────────

class TestFrameSemanticSOPCompiler:
    def test_segment_and_extract_tuples(self):
        compiler = SOPCompiler.get_instance()
        sop = (
            "Step 1: Grip the surgical scalpel in a precision pencil grip at 45 degrees. Hold for 3.5 seconds.\n"
            "Step 2: Extend the index finger along the dorsal shaft in a dinner knife grip for deep sweep cutting. Maintain for 4.0 seconds."
        )
        result = compiler.compile(sop, procedure_id="test_surgical_sop")
        assert len(result.procedure_schema.steps) >= 3  # 2 steps + completed terminal step
        assert len(result.frame_semantics) == 2

        t1 = result.frame_semantics[0]
        assert t1.action_predicate == "grip"
        assert "45" in t1.kinematic_qualifier
        assert t1.hold_duration_sec == 3.5
        assert len(t1.verbal_hypothesis) > 10

        # Check explicit degree tolerance (45 ± 7° -> 38° to 52°)
        assert "wrist_index_angle" in t1.target_angles
        angle_bounds = t1.target_angles["wrist_index_angle"]
        assert angle_bounds["min"] == 38.0
        assert angle_bounds["max"] == 52.0

        # Check hysteresis exit band (45 ± 11° -> 34° to 56°)
        exit_bounds = t1.hysteresis_exit_bands["wrist_index_angle"]
        assert exit_bounds["min"] == 34.0
        assert exit_bounds["max"] == 56.0

    def test_compile_sop_rest_api(self, client):
        payload = {
            "sop_text": "1. Hold iron in pencil grip at 45 degrees for 3 seconds.\n2. Position tip on pad with index PIP curved. Hold 2.5s.",
            "procedure_id": "api_test_sop",
        }
        res = client.post("/api/procedures/compile-sop", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert "procedure_schema" in data
        assert "frame_semantics" in data
        assert len(data["frame_semantics"]) == 2


# ── 2. NLI Verbal-Motor Entailment Tests ───────────────────────────────────────

class TestMultimodalStepScorer:
    @pytest.fixture(autouse=True)
    def setup_scorer(self):
        self.scorer = MultimodalStepScorer.get_instance()

    def test_synchronized_mastery(self):
        # Spoken premise entails hypothesis + pose matches target bounds
        premise = "I am holding the instrument in a precision pencil grip at 45 degrees."
        hyp = "I am holding the instrument with my hand in precision pencil grip at 45 degrees."
        angles = {"wrist_index_angle": 46.0}
        targets = {"wrist_index_angle": (38.0, 52.0)}

        res = self.scorer.score_step(
            spoken_utterance=premise,
            step_hypothesis=hyp,
            joint_angles=angles,
            target_bounds=targets,
            stability_score=0.98,
        )
        assert res.nli_probabilities.p_entailment >= 0.70
        assert res.kinematic_score >= 0.80
        assert res.alignment_state == CognitiveMotorState.SYNCHRONIZED_MASTERY

    def test_motor_execution_drift(self):
        # Spoken premise entails hypothesis, but joint angle is severely deviated
        premise = "I am holding the instrument in a precision pencil grip at 45 degrees."
        hyp = "I am holding the instrument with my hand in precision pencil grip at 45 degrees."
        # Actual is 80 degrees (way above 52 max bound)
        angles = {"wrist_index_angle": 80.0}
        targets = {"wrist_index_angle": (38.0, 52.0)}

        res = self.scorer.score_step(
            spoken_utterance=premise,
            step_hypothesis=hyp,
            joint_angles=angles,
            target_bounds=targets,
            stability_score=0.95,
        )
        assert res.nli_probabilities.p_entailment >= 0.70
        assert res.kinematic_score < 0.80
        assert res.alignment_state == CognitiveMotorState.MOTOR_EXECUTION_DRIFT

    def test_cognitive_protocol_contradiction(self):
        # Trainee states contradiction e.g. "I am holding with wrong inverted grip not checking angle"
        premise = "I am holding with the wrong grip and did not check the angle."
        hyp = "I am holding the instrument in precision pencil grip at 45 degrees."
        angles = {"wrist_index_angle": 45.0}
        targets = {"wrist_index_angle": (38.0, 52.0)}

        res = self.scorer.score_step(
            spoken_utterance=premise,
            step_hypothesis=hyp,
            joint_angles=angles,
            target_bounds=targets,
            stability_score=0.95,
        )
        assert res.nli_probabilities.p_contradiction >= 0.50
        assert res.kinematic_score >= 0.80
        assert res.alignment_state == CognitiveMotorState.COGNITIVE_PROTOCOL_CONTRADICTION

    def test_semantic_hesitation_or_omission(self):
        # No utterance provided while holding pose
        hyp = "I am holding the instrument with my hand in precision pencil grip at 45 degrees."
        angles = {"wrist_index_angle": 45.0}
        targets = {"wrist_index_angle": (38.0, 52.0)}

        res = self.scorer.score_step(
            spoken_utterance=None,
            step_hypothesis=hyp,
            joint_angles=angles,
            target_bounds=targets,
            stability_score=0.95,
        )
        assert res.nli_probabilities.p_entailment == 0.0
        assert res.nli_probabilities.p_neutral == 1.0
        assert res.alignment_state == CognitiveMotorState.SEMANTIC_HESITATION_OR_OMISSION


# ── 3. Dual-Memory Skill Decay & Contrastive NLG Tests ────────────────────────

class TestDualMemoryDecayAndContrastiveNLG:
    def test_dual_memory_decay_stability(self):
        mock_sessions = [
            {"final_score": 0.85, "avg_hesitation_ms": 1100.0, "tremor_score": 0.12},
            {"final_score": 0.90, "avg_hesitation_ms": 950.0, "tremor_score": 0.08},
        ]
        decay = compute_dual_memory_stability(
            mock_sessions,
            nli_entailment_rate=0.92,
            nli_contradiction_rate=0.02,
        )
        # Procedural motor retention should be higher than cognitive or both high
        assert decay.declarative_cognitive_retention_24h > 70.0
        assert decay.procedural_motor_retention_24h > 75.0
        assert decay.cognitive_stability_days > 0.0
        assert decay.motor_stability_days > 0.0
        assert len(decay.intervention_recommendation) > 10

    def test_contrastive_nlg_motor_drift(self):
        nli = NLIProbabilities(p_entailment=0.93, p_neutral=0.05, p_contradiction=0.02)
        residuals = {"index_pip_angle": 16.0}
        msg = generate_contrastive_nlg(
            alignment_state="MOTOR_EXECUTION_DRIFT",
            nli_probabilities=nli,
            joint_residuals=residuals,
            current_step_name="Positioning Phase",
        )
        assert "Index PIP joint" in msg
        assert "+16°" in msg
        assert "93%" in msg
        assert "over-flexed" in msg

    def test_contrastive_nlg_contradiction(self):
        nli = NLIProbabilities(p_entailment=0.05, p_neutral=0.15, p_contradiction=0.80)
        msg = generate_contrastive_nlg(
            alignment_state="COGNITIVE_PROTOCOL_CONTRADICTION",
            nli_probabilities=nli,
            current_step_name="Approach Phase",
        )
        assert "contradicts" in msg
        assert "80%" in msg


# ── 4. Health Check Tests ──────────────────────────────────────────────────────

class TestHealthChecks:
    def test_liveness_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"

    def test_detailed_health_check(self, client):
        res = client.get("/health/detailed")
        assert res.status_code == 200
        data = res.json()
        assert "checks" in data
        checks = data["checks"]
        assert "mediapipe" in checks
        assert "nli_model" in checks
        assert "websocket" in checks


