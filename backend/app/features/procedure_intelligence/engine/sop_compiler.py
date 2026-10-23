"""
Frame-Semantic SOP-to-Kinematic Compiler (CCNLP NLP Pillar 1).

Parses raw, unstructured English SOP instructional paragraphs (e.g., surgical scalpel handling,
laboratory pipetting, assembly manuals) into executable 3D kinematic state machines (ProcedureSchema).

Extracts Frame-Semantic Action Tuples per step:
  - action_predicate (e.g., "grip", "flex", "pinch", "rotate", "hold")
  - anatomical_articulator (e.g., "index PIP", "thumb and index fingertip", "wrist")
  - kinematic_qualifier (e.g., "at 45 degrees", "like a pencil", "firmly")
  - hold_duration_sec (extracted temporal requirement, default 2.5s)
  - verbal_hypothesis (canonical declarative statement for Think-Aloud entailment)

Explicit angles are bound with ±7° tolerance band (±11° hysteresis exit band).
Qualitative descriptors are grounded into canonical joint bounds using
sentence-transformers/all-MiniLM-L6-v2 cosine similarity against ontology.json.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from app.core.settings import get_settings
from app.features.procedure_intelligence.engine.schema import (
    AngleConstraint,
    DistanceConstraint,
    ProcedureSchema,
    StepConstraints,
    StepSchema,
)

logger = logging.getLogger(__name__)


class FrameSemanticTuple(BaseModel):
    """Extracted Frame-Semantic Action Tuple for a procedural step."""
    step_index: int
    raw_text: str
    action_predicate: str
    anatomical_articulator: str
    kinematic_qualifier: str
    hold_duration_sec: float = 2.5
    verbal_hypothesis: str
    matched_primitive_id: Optional[str] = None
    similarity_score: Optional[float] = None
    target_angles: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    target_distances: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    hysteresis_exit_bands: Dict[str, Dict[str, float]] = Field(default_factory=dict)


class SOPCompilerResult(BaseModel):
    """Result of SOP compilation containing the executable state machine and parse tree."""
    procedure_schema: ProcedureSchema
    frame_semantics: List[FrameSemanticTuple]
    raw_paragraph: str


# Pre-defined predicates, articulators, and qualifiers
PREDICATE_PATTERNS = [
    (r"\b(grip|grasp|hold|maintain|clench)\b", "grip"),
    (r"\b(flex|bend|curve)\b", "flex"),
    (r"\b(extend|straighten|point)\b", "extend"),
    (r"\b(pinch|tweezer|oppose)\b", "pinch"),
    (r"\b(rotate|tilt|angle|orient|incline)\b", "rotate"),
    (r"\b(approach|advance|enter|lower|raise)\b", "approach"),
    (r"\b(position|align|stabilize|place)\b", "position"),
    (r"\b(cut|incise|sweep|press|dispense)\b", "cut"),
    (r"\b(dwell|rest|pause|stay)\b", "dwell"),
]

ARTICULATOR_PATTERNS = [
    (r"\b(index\s+pip|index\s+proximal\s+interphalangeal)\b", "index PIP"),
    (r"\b(index\s+mcp|index\s+metacarpophalangeal|index\s+knuckle)\b", "index MCP"),
    (r"\b(index\s+dip|index\s+distal\s+interphalangeal|index\s+fingertip)\b", "index DIP"),
    (r"\b(thumb\s+and\s+index(?:\s+fingertip|\s+finger)?|thumb-index)\b", "thumb and index"),
    (r"\b(thumb\s+and\s+middle(?:\s+fingertip|\s+finger)?|thumb-middle)\b", "thumb and middle"),
    (r"\b(middle\s+finger|middle\s+pip|middle\s+mcp)\b", "middle finger"),
    (r"\b(ring\s+finger|pinky|little\s+finger)\b", "ring and pinky"),
    (r"\b(wrist|forearm|carpal)\b", "wrist"),
    (r"\b(thumb|pollex)\b", "thumb"),
    (r"\b(index\s+finger|index)\b", "index finger"),
    (r"\b(all\s+fingers|digits|fist|palm|hand)\b", "hand"),
]


class SOPCompiler:
    """Singleton Frame-Semantic SOP Compiler."""

    _instance: Optional["SOPCompiler"] = None

    def __init__(self, ontology_path: Optional[str] = None):
        self.settings = get_settings()
        self.ontology_path = Path(ontology_path or self.settings.ontology_path)
        self.ontology: List[Dict[str, Any]] = []
        self._load_ontology()

        # Model placeholder
        self._embedder = None
        self._ontology_embeddings = None
        self._embedder_failed = False

    @classmethod
    def get_instance(cls) -> "SOPCompiler":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_ontology(self) -> None:
        if self.ontology_path.exists():
            try:
                with open(self.ontology_path, "r", encoding="utf-8") as f:
                    self.ontology = json.load(f)
                logger.info(f"Loaded {len(self.ontology)} ontology primitives from {self.ontology_path}")
            except Exception as e:
                logger.error(f"Failed to load ontology from {self.ontology_path}: {e}")
                self.ontology = []
        else:
            logger.warning(f"Ontology path {self.ontology_path} does not exist.")

    def _get_embedder(self):
        if self._embedder is None and not self._embedder_failed:
            try:
                from sentence_transformers import SentenceTransformer
                model_name = self.settings.embedding_model_name
                logger.info(f"Loading SentenceTransformer: {model_name}")
                self._embedder = SentenceTransformer(model_name)
                # Compute embeddings for ontology primitives
                if self.ontology:
                    texts = [
                        f"{p.get('name', '')}. {p.get('description', '')} {' '.join(p.get('keywords', []))}"
                        for p in self.ontology
                    ]
                    self._ontology_embeddings = self._embedder.encode(texts, convert_to_tensor=True)
                    logger.info(f"Pre-encoded {len(texts)} ontology primitive embeddings.")
            except Exception as exc:
                logger.warning(f"Could not load SentenceTransformer ({exc}); using lexical ontology fallback.")
                self._embedder_failed = True
        return self._embedder

    def segment_text(self, text: str) -> List[str]:
        """Segment raw English SOP paragraph into sequential step instructions."""
        clean_text = text.strip()
        if not clean_text:
            return []

        # Check for numbered steps: "1.", "1)", "Step 1:", "Step 1 -", etc.
        lines = [line.strip() for line in clean_text.splitlines() if line.strip()]
        numbered_steps: List[str] = []
        current_step: List[str] = []

        for line in lines:
            if re.match(r"^(?:step\s*\d+[:\-.]?|\d+[\.\)]|\-\s+)", line, re.IGNORECASE):
                if current_step:
                    numbered_steps.append(" ".join(current_step))
                    current_step = []
                cleaned_line = re.sub(r"^(?:step\s*\d+[:\-.]?|\d+[\.\)]|\-\s+)", "", line, flags=re.IGNORECASE).strip()
                current_step.append(cleaned_line)
            else:
                if current_step:
                    current_step.append(line)
                else:
                    current_step.append(line)

        if current_step:
            numbered_steps.append(" ".join(current_step))

        if len(numbered_steps) > 1:
            return numbered_steps

        # Fallback to sentence splitting on punctuation
        raw_sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", clean_text)
        sentences = [s.strip() for s in raw_sentences if len(s.strip()) > 8]
        return sentences if sentences else [clean_text]

    def extract_action_predicate(self, text: str) -> str:
        text_lower = text.lower()
        for pattern, pred in PREDICATE_PATTERNS:
            if re.search(pattern, text_lower):
                return pred
        return "hold"

    def extract_articulator(self, text: str) -> str:
        text_lower = text.lower()
        for pattern, art in ARTICULATOR_PATTERNS:
            if re.search(pattern, text_lower):
                return art
        return "hand"

    def extract_hold_duration(self, text: str) -> float:
        # Match "hold for 3 seconds", "dwell 2.5s", "for 3 sec", "3 seconds"
        match = re.search(r"(?:for|dwell|hold(?:\s+for)?|maintain(?:\s+for)?)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b", text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass
        match_simple = re.search(r"(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b", text, re.IGNORECASE)
        if match_simple:
            try:
                return float(match_simple.group(1))
            except ValueError:
                pass
        return 2.5

    def extract_kinematic_qualifier(self, text: str) -> str:
        # Extract expressions like "at 45 degrees", "like a pencil", "in dinner knife grip", "at 30° to 45°"
        degree_match = re.search(r"(?:at|between|around|with(?:\s+a)?)\s*(\d+°?(?:\s*(?:to|-|–)\s*\d+°?)?\s*(?:degrees?|deg|°))", text, re.IGNORECASE)
        grip_match = re.search(r"(?:in|like|with(?:\s+a)?)\s*([a-z\-\s]+(?:grip|pinch|grasp|fist|posture|position))", text, re.IGNORECASE)

        qualifiers = []
        if grip_match:
            qualifiers.append(grip_match.group(0).strip())
        if degree_match:
            qualifiers.append(degree_match.group(0).strip())

        if qualifiers:
            return " ".join(qualifiers)

        # Fallback to key adjective phrase
        for phrase in ["firmly", "steady", "upright", "straight", "tightly", "relaxed", "extended"]:
            if phrase in text.lower():
                return phrase

        return "controlled posture"

    def parse_explicit_degrees(self, text: str, articulator: str) -> Tuple[Dict[str, Tuple[float, float]], Dict[str, Tuple[float, float]]]:
        """Extract explicit numerical degrees with ±7° enter band and ±11° exit hysteresis band."""
        enter_bands: Dict[str, Tuple[float, float]] = {}
        exit_bands: Dict[str, Tuple[float, float]] = {}

        # Look for ranges e.g. "30 to 45 degrees", "40-130°", "30°–45°"
        range_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)", text, re.IGNORECASE)
        single_match = re.search(r"(?:at|of|to|around)\s*(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)", text, re.IGNORECASE)

        # Determine target joint name
        joint = "wrist_index_angle"
        art_lower = articulator.lower()
        if "pip" in art_lower or "proximal" in art_lower:
            joint = "index_pip_angle"
        elif "mcp" in art_lower or "knuckle" in art_lower:
            joint = "index_mcp_angle"
        elif "dip" in art_lower or "fingertip" in art_lower:
            joint = "index_dip_angle"
        elif "wrist" in art_lower or "angle" in text.lower():
            joint = "wrist_index_angle"

        if range_match:
            d1 = float(range_match.group(1))
            d2 = float(range_match.group(2))
            min_deg, max_deg = min(d1, d2), max(d1, d2)
            # Enter band: [min_deg, max_deg], exit band: [min_deg - 4.0, max_deg + 4.0]
            enter_bands[joint] = (max(0.0, min_deg), min(180.0, max_deg))
            exit_bands[joint] = (max(0.0, min_deg - 4.0), min(180.0, max_deg + 4.0))
        elif single_match:
            d = float(single_match.group(1))
            enter_bands[joint] = (max(0.0, d - 7.0), min(180.0, d + 7.0))
            exit_bands[joint] = (max(0.0, d - 11.0), min(180.0, d + 11.0))

        return enter_bands, exit_bands

    def match_ontology_primitive(self, text: str) -> Tuple[Optional[Dict[str, Any]], float]:
        """Find the most semantically relevant biomechanical primitive from ontology.json."""
        if not self.ontology:
            return None, 0.0

        embedder = self._get_embedder()
        if embedder is not None and self._ontology_embeddings is not None:
            try:
                import torch
                query_emb = embedder.encode(text, convert_to_tensor=True)
                cos_scores = torch.nn.functional.cosine_similarity(query_emb.unsqueeze(0), self._ontology_embeddings)
                best_idx = int(torch.argmax(cos_scores).item())
                best_score = float(cos_scores[best_idx].item())
                if best_score >= 0.28:
                    return self.ontology[best_idx], best_score
            except Exception as e:
                logger.warning(f"Error in vector similarity matching: {e}")

        # Lexical fallback matching
        text_lower = text.lower()
        best_primitive = None
        best_score = 0.0

        for primitive in self.ontology:
            score = 0.0
            pid = primitive.get("id", "").lower().replace("_", " ")
            pname = primitive.get("name", "").lower()
            keywords = [k.lower() for k in primitive.get("keywords", [])]

            if pid in text_lower or pname in text_lower:
                score += 0.6
            for kw in keywords:
                if kw in text_lower:
                    score += 0.35

            if score > best_score:
                best_score = score
                best_primitive = primitive

        return (best_primitive, min(1.0, best_score)) if best_score > 0.2 else (None, 0.0)

    def generate_verbal_hypothesis(self, predicate: str, articulator: str, qualifier: str, raw_text: str) -> str:
        """Generate canonical declarative statement for trainee Think-Aloud verbal entailment."""
        clean_qualifier = qualifier.strip()
        if clean_qualifier:
            return f"I am {predicate}ing the instrument with my {articulator} {clean_qualifier}."
        return f"I am {predicate}ing the {articulator} steadily in position."

    def compile(self, raw_text: str, procedure_id: str = "custom_compiled_sop") -> SOPCompilerResult:
        """Compile unstructured English SOP text into an executable ProcedureSchema and parse tree."""
        step_texts = self.segment_text(raw_text)
        tuples: List[FrameSemanticTuple] = []
        step_schemas: List[StepSchema] = []

        total_steps = len(step_texts)
        for i, text in enumerate(step_texts):
            step_id = f"step_{i + 1}"
            next_step_id = f"step_{i + 2}" if i + 1 < total_steps else "completed"

            predicate = self.extract_action_predicate(text)
            articulator = self.extract_articulator(text)
            hold_sec = self.extract_hold_duration(text)
            qualifier = self.extract_kinematic_qualifier(text)
            verbal_hyp = self.generate_verbal_hypothesis(predicate, articulator, qualifier, text)

            # Match ontology primitive for qualitative grounding
            matched_prim, score = self.match_ontology_primitive(f"{text} {qualifier}")

            # Explicit degree bounds
            explicit_enter, explicit_exit = self.parse_explicit_degrees(text, articulator)

            # Aggregate target angles and distances
            target_angles: Dict[str, Dict[str, float]] = {}
            target_distances: Dict[str, Dict[str, float]] = {}
            hysteresis_exit: Dict[str, Dict[str, float]] = {}

            # 1. Start with ontology bounds if matched
            if matched_prim:
                for k, v in matched_prim.get("angles", {}).items():
                    target_angles[k] = {"min": float(v["min"]), "max": float(v["max"])}
                    hysteresis_exit[k] = {
                        "min": max(0.0, float(v["min"]) - 4.0),
                        "max": min(180.0, float(v["max"]) + 4.0),
                    }
                for k, v in matched_prim.get("distances", {}).items():
                    target_distances[k] = {"min": float(v.get("min", 0.0)), "max": float(v["max"])}

            # 2. Override / enrich with explicit numerical degree bounds
            for joint_name, (min_deg, max_deg) in explicit_enter.items():
                target_angles[joint_name] = {"min": min_deg, "max": max_deg}
            for joint_name, (min_deg, max_deg) in explicit_exit.items():
                hysteresis_exit[joint_name] = {"min": min_deg, "max": max_deg}

            # 3. Fallback defaults if no angles were extracted
            if not target_angles and not target_distances:
                target_angles["wrist_index_angle"] = {"min": 35.0, "max": 140.0}
                hysteresis_exit["wrist_index_angle"] = {"min": 30.0, "max": 145.0}

            # Assemble StepConstraints
            angle_constraints = {k: AngleConstraint(min=v["min"], max=v["max"]) for k, v in target_angles.items()}
            dist_constraints = {k: DistanceConstraint(min=v.get("min"), max=v.get("max")) for k, v in target_distances.items()}

            constraints = StepConstraints(angles=angle_constraints, distances=dist_constraints)

            step_name = f"Step {i + 1}: {predicate.title()} {articulator.title()}"
            step_schema = StepSchema(
                id=step_id,
                name=step_name,
                description=text,
                method=f"{predicate.title()} {articulator} {qualifier}. Maintain steady hold for {hold_sec:.1f}s.",
                feedback={
                    "correct": f"Excellent {predicate} posture and verbal alignment.",
                    "incorrect": f"Adjust {articulator} alignment to meet target bounds.",
                },
                constraints=constraints,
                dwell_time_ms=int(hold_sec * 1000),
                next_step=next_step_id,
                verbal_hypothesis=verbal_hyp,
            )
            step_schemas.append(step_schema)

            sem_tuple = FrameSemanticTuple(
                step_index=i + 1,
                raw_text=text,
                action_predicate=predicate,
                anatomical_articulator=articulator,
                kinematic_qualifier=qualifier,
                hold_duration_sec=hold_sec,
                verbal_hypothesis=verbal_hyp,
                matched_primitive_id=matched_prim.get("id") if matched_prim else None,
                similarity_score=score,
                target_angles=target_angles,
                target_distances=target_distances,
                hysteresis_exit_bands=hysteresis_exit,
            )
            tuples.append(sem_tuple)

        # Add completed terminal step
        completed_step = StepSchema(
            id="completed",
            name="Completed",
            description="Procedure completed successfully.",
            constraints=StepConstraints(),
            dwell_time_ms=0,
            next_step="completed",
            verbal_hypothesis="Procedure successfully completed.",
        )
        step_schemas.append(completed_step)

        proc_schema = ProcedureSchema(
            procedure_id=procedure_id,
            steps=step_schemas,
        )

        return SOPCompilerResult(
            procedure_schema=proc_schema,
            frame_semantics=tuples,
            raw_paragraph=raw_text,
        )
