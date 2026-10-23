"""
Dual-Memory Skill Decay Modeling (CCNLP NLP Pillar 3).

Separates skill retention prediction into two distinct Ebbinghaus exponential decay curves:
    R(t) = exp(-t / S)

1. Declarative Cognitive Retention (S_cog):
   Derived from historical NLI Entailment rates, Contradiction penalties,
   and Think-Aloud callout hesitation latency.

2. Procedural Motor Retention (S_motor):
   Derived from 1€-filtered joint angle residuals, hold variance,
   and tremor/fatigue indices.

Returns predicted 24-hour and 7-day retention percentages for BOTH pathways
plus a targeted academic intervention recommendation.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.core.database import get_db


class DualMemoryDecay(BaseModel):
    """Detailed dual-pathway decay metrics."""
    cognitive_stability_days: float = Field(..., description="Declarative cognitive stability S_cog in days")
    motor_stability_days: float = Field(..., description="Procedural motor stability S_motor in days")
    declarative_cognitive_retention_24h: float = Field(..., description="Cognitive retention at 24 hours (%)")
    declarative_cognitive_retention_7d: float = Field(..., description="Cognitive retention at 7 days (%)")
    procedural_motor_retention_24h: float = Field(..., description="Motor retention at 24 hours (%)")
    procedural_motor_retention_7d: float = Field(..., description="Motor retention at 7 days (%)")
    intervention_recommendation: str = Field(..., description="Targeted cognitive vs motor pedagogical intervention")


class DecaySummary(BaseModel):
    """Serialized decay prediction (REST + WebSocket), backward-compatible with dual-memory extensions."""

    student_id: str
    total_sessions: int
    last_session_date: str | None = None
    last_score: float = 0.0
    decay_rate: float = 0.0
    current_competency: float = 0.0
    projected_decay_date: str | None = None
    days_until_decay: float | None = None
    refresher_date: str | None = None
    refresher_needed: bool = False

    # Dual-memory additions
    cognitive_stability_days: float = 5.0
    motor_stability_days: float = 6.0
    declarative_cognitive_retention_24h: float = 81.87
    declarative_cognitive_retention_7d: float = 24.66
    procedural_motor_retention_24h: float = 84.65
    procedural_motor_retention_7d: float = 31.14
    intervention_recommendation: str = "Maintain consistent practice across both verbalization and physical holds."


# -- Constants -----------------------------------------------------------

PROJECTED_DECAY_THRESHOLD = 0.45
CRITICAL_COMPETENCY_THRESHOLD = 0.35
REFRESHER_BUFFER_DAYS = 1
POST_SESSION_GRACE_DAYS = 1
BASE_DECAY_RATE = 0.10        # default λ per day
MIN_DECAY_RATE = 0.02         # floor
MAX_DECAY_RATE = 0.30         # ceiling


def compute_dual_memory_stability(
    sessions: List[Dict[str, Any]],
    nli_entailment_rate: float = 0.85,
    nli_contradiction_rate: float = 0.05,
) -> DualMemoryDecay:
    """Compute S_cog and S_motor and projected 24h & 7d retention percentages."""
    n = max(1, len(sessions))
    avg_hesitation = sum(s.get("avg_hesitation_ms", 0.0) for s in sessions) / n if sessions else 1200.0
    avg_tremor = sum(s.get("tremor_score", 0.0) for s in sessions) / n if sessions else 0.15
    avg_score = sum(s.get("final_score", 0.0) for s in sessions) / n if sessions else 0.80

    # 1. Cognitive Stability S_cog (days)
    # Declarative knowledge decays faster without active rehearsal
    base_s_cog = 5.0
    practice_cog = 1.0 + 0.35 * math.log(1 + n)
    entail_bonus = nli_entailment_rate * 3.5
    contra_penalty = nli_contradiction_rate * 5.0
    hesitation_factor = max(0.5, 1.0 - (avg_hesitation / 8000.0))

    s_cog = (base_s_cog * practice_cog + entail_bonus - contra_penalty) * hesitation_factor
    s_cog = max(1.0, min(30.0, s_cog))

    # 2. Procedural Motor Stability S_motor (days)
    # Motor memory has higher baseline stability once consolidated (Ebbinghaus / Adams motor trace)
    base_s_motor = 6.5
    practice_motor = 1.0 + 0.50 * math.log(1 + n)
    tremor_penalty = 1.0 - (avg_tremor * 0.4)
    score_bonus = avg_score * 2.0

    s_motor = (base_s_motor * practice_motor + score_bonus) * max(0.5, tremor_penalty)
    s_motor = max(1.2, min(45.0, s_motor))

    # Retention: R(t) = exp(-t / S) * 100%
    r_cog_24h = round(math.exp(-1.0 / s_cog) * 100.0, 2)
    r_cog_7d = round(math.exp(-7.0 / s_cog) * 100.0, 2)

    r_motor_24h = round(math.exp(-1.0 / s_motor) * 100.0, 2)
    r_motor_7d = round(math.exp(-7.0 / s_motor) * 100.0, 2)

    # Targeted intervention recommendation
    if r_cog_7d < r_motor_7d - 12.0:
        recommendation = (
            "Declarative Cognitive Decay Alert: Spoken procedural callout retention is degrading faster than motor posture. "
            "Focus on Think-Aloud verbal protocols during procedure transitions."
        )
    elif r_motor_7d < r_cog_7d - 12.0:
        recommendation = (
            "Procedural Motor Drift Alert: Joint angle precision and isometric hold stability are decaying. "
            "Practice steady instrument holds with One-Euro tremor feedback."
        )
    elif min(r_cog_7d, r_motor_7d) >= 60.0:
        recommendation = (
            "Dual-Pathway Mastery: High multi-day retention across both cognitive protocol knowledge and kinematic execution."
        )
    else:
        recommendation = (
            "Dual-Pathway Refresher Required: Scheduled multimodal practice recommended with synchronized verbal and motor feedback."
        )

    return DualMemoryDecay(
        cognitive_stability_days=round(s_cog, 2),
        motor_stability_days=round(s_motor, 2),
        declarative_cognitive_retention_24h=r_cog_24h,
        declarative_cognitive_retention_7d=r_cog_7d,
        procedural_motor_retention_24h=r_motor_24h,
        procedural_motor_retention_7d=r_motor_7d,
        intervention_recommendation=recommendation,
    )


def _estimate_decay_rate(sessions: list[dict[str, Any]]) -> float:
    """Estimate personal decay rate λ from session history."""
    if not sessions:
        return BASE_DECAY_RATE

    n = len(sessions)
    avg_hesitation = sum(s.get("avg_hesitation_ms", 0) for s in sessions) / n
    avg_tremor = sum(s.get("tremor_score", 0) for s in sessions) / n
    avg_score = sum(s.get("final_score", 0) for s in sessions) / n

    lam = BASE_DECAY_RATE
    practice_factor = 1.0 / (1.0 + 0.15 * math.log(1 + n))
    lam *= practice_factor

    hesitation_factor = 1.0 + min(0.5, avg_hesitation / 6000.0)
    lam *= hesitation_factor

    tremor_factor = 1.0 + (avg_tremor * 0.4)
    lam *= tremor_factor

    score_factor = 1.0 - (avg_score * 0.2)
    lam *= max(0.5, score_factor)

    return max(MIN_DECAY_RATE, min(MAX_DECAY_RATE, lam))


def _compute_competency(s0: float, lam: float, days: float) -> float:
    """competency(t) = S₀ × e^(-λ×t)"""
    return s0 * math.exp(-lam * max(0.0, days))


def _days_until_threshold(
    s0: float,
    lam: float,
    threshold: float,
) -> float | None:
    """Solve for t where competency(t) = threshold → t = -ln(threshold/S₀)/λ"""
    if s0 <= 0 or lam <= 0:
        return None
    ratio = threshold / s0
    if ratio >= 1.0:
        return 0.0
    if ratio <= 0:
        return None
    return -math.log(ratio) / lam


def _parse_session_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def predict_decay(student_id: str) -> dict[str, Any]:
    """Generate a full dual-pathway decay prediction for a student."""
    db = get_db()

    sessions = db.fetch_all(
        """
        SELECT final_score, duration_ms, attempt_count,
               avg_hesitation_ms, tremor_score, completed_at
        FROM sessions
        WHERE student_id = ? AND passed = 1
        ORDER BY completed_at ASC
        """,
        (student_id,),
    )

    dual = compute_dual_memory_stability(sessions)

    if not sessions:
        return {
            "student_id": student_id,
            "total_sessions": 0,
            "last_session_date": None,
            "last_score": 0.0,
            "decay_rate": BASE_DECAY_RATE,
            "current_competency": 0.0,
            "projected_decay_date": None,
            "days_until_decay": None,
            "refresher_date": None,
            "refresher_needed": False,
            "cognitive_stability_days": dual.cognitive_stability_days,
            "motor_stability_days": dual.motor_stability_days,
            "declarative_cognitive_retention_24h": dual.declarative_cognitive_retention_24h,
            "declarative_cognitive_retention_7d": dual.declarative_cognitive_retention_7d,
            "procedural_motor_retention_24h": dual.procedural_motor_retention_24h,
            "procedural_motor_retention_7d": dual.procedural_motor_retention_7d,
            "intervention_recommendation": dual.intervention_recommendation,
        }

    last = sessions[-1]
    s0 = float(last.get("final_score", 0.0))
    last_date_str = str(last.get("completed_at", ""))

    try:
        last_date = _parse_session_datetime(last_date_str)
    except (ValueError, TypeError):
        last_date = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    if last_date.tzinfo is None:
        days_elapsed = (now.replace(tzinfo=None) - last_date).total_seconds() / 86400.0
    else:
        days_elapsed = (now - last_date).total_seconds() / 86400.0

    lam = _estimate_decay_rate(sessions)
    current_comp = _compute_competency(s0, lam, days_elapsed)
    decay_days_total = _days_until_threshold(s0, lam, PROJECTED_DECAY_THRESHOLD)

    projected_decay_date = None
    refresher_date = None
    days_until_decay = None

    decay_dt = None
    if decay_days_total is not None:
        decay_dt = last_date + timedelta(days=decay_days_total)
        projected_decay_date = decay_dt.isoformat()

        if last_date.tzinfo is None:
            days_until_decay = (decay_dt - now.replace(tzinfo=None)).total_seconds() / 86400.0
        else:
            days_until_decay = (decay_dt - now).total_seconds() / 86400.0

    if decay_dt is not None:
        refresher_dt = decay_dt - timedelta(days=REFRESHER_BUFFER_DAYS)
        refresher_date = refresher_dt.isoformat()

    refresher_needed = (
        current_comp <= CRITICAL_COMPETENCY_THRESHOLD
        or (days_until_decay is not None and days_until_decay <= 0)
        or (
            days_elapsed >= POST_SESSION_GRACE_DAYS
            and decay_dt is not None
            and now >= decay_dt - timedelta(days=REFRESHER_BUFFER_DAYS)
        )
    )

    return {
        "student_id": student_id,
        "total_sessions": len(sessions),
        "last_session_date": last_date.isoformat(),
        "last_score": round(s0, 4),
        "decay_rate": round(lam, 4),
        "current_competency": round(max(0.0, min(1.0, current_comp)), 4),
        "projected_decay_date": projected_decay_date,
        "days_until_decay": round(days_until_decay, 1) if days_until_decay is not None else None,
        "refresher_date": refresher_date,
        "refresher_needed": bool(refresher_needed),
        "cognitive_stability_days": dual.cognitive_stability_days,
        "motor_stability_days": dual.motor_stability_days,
        "declarative_cognitive_retention_24h": dual.declarative_cognitive_retention_24h,
        "declarative_cognitive_retention_7d": dual.declarative_cognitive_retention_7d,
        "procedural_motor_retention_24h": dual.procedural_motor_retention_24h,
        "procedural_motor_retention_7d": dual.procedural_motor_retention_7d,
        "intervention_recommendation": dual.intervention_recommendation,
    }
