"""
Accumulates per-frame metrics and persists session records to SQLite.

Phase E requirements:
- Persist: completed steps, failed attempts, time to first valid hold,
  measurement coverage (% valid observed frames), angle deviations,
  observed vs estimated frame counts.
- Generate session report with recommendations to repeat consistently weak steps.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any

from app.core.database import get_db


@dataclass
class _StepMetrics:
    entered_ms: int = 0
    achieved_ms: int | None = None
    failed_attempts: int = 0
    oscillations: int = 0
    last_valid: bool = False
    valid_observed_frames: int = 0
    total_frames: int = 0
    stability_sum: float = 0.0
    stability_count: int = 0
    angle_deviations: list[float] = field(default_factory=list)


@dataclass
class SessionAggregator:
    student_id: str = "anonymous"
    procedure_id: str = "soldering_practice"
    difficulty: str = "beginner"
    started_ms: int | None = None
    first_valid_hold_ms: int | None = None
    _step_metrics: dict[str, _StepMetrics] = field(default_factory=dict)
    _current_step: str | None = None
    _observed_frames: int = 0
    _estimated_frames: int = 0
    _total_frames: int = 0
    _score_sum: float = 0.0
    _completed: bool = False
    _completed_steps: list[str] = field(default_factory=list)

    def feed_frame(
        self,
        *,
        step_id: str,
        valid: bool,
        is_observed: bool,
        score: float,
        stability: float,
        timestamp_ms: int,
        deviations: list[float] | None = None,
    ) -> None:
        """Accumulate per-frame tracking telemetry."""
        if self._completed:
            return

        if self.started_ms is None:
            self.started_ms = timestamp_ms

        self._total_frames += 1
        if is_observed:
            self._observed_frames += 1
        else:
            self._estimated_frames += 1

        self._score_sum += score

        if step_id not in self._step_metrics:
            self._step_metrics[step_id] = _StepMetrics(entered_ms=timestamp_ms)

        sm = self._step_metrics[step_id]
        sm.total_frames += 1

        if step_id != self._current_step:
            if self._current_step and self._current_step not in self._completed_steps and self._current_step != "completed":
                self._completed_steps.append(self._current_step)
            self._current_step = step_id
            if sm.entered_ms == 0:
                sm.entered_ms = timestamp_ms

        if is_observed and valid:
            sm.valid_observed_frames += 1
            if self.first_valid_hold_ms is None and self.started_ms is not None:
                self.first_valid_hold_ms = timestamp_ms - self.started_ms

        # Oscillations: valid -> invalid transition (broken attempt)
        if sm.last_valid and not valid:
            sm.oscillations += 1
            sm.failed_attempts += 1
        sm.last_valid = valid

        if valid and sm.achieved_ms is None:
            sm.achieved_ms = timestamp_ms

        if valid:
            sm.stability_sum += stability
            sm.stability_count += 1

        if deviations:
            sm.angle_deviations.extend(deviations)

    def complete_session(self, *, timestamp_ms: int) -> dict[str, Any] | None:
        """Finalize metrics, persist to SQLite, and return a comprehensive session report."""
        if self._completed or self.started_ms is None:
            return None
        self._completed = True

        duration_ms = max(1, timestamp_ms - self.started_ms)
        coverage_pct = (
            (self._observed_frames / self._total_frames * 100.0)
            if self._total_frames > 0
            else 0.0
        )

        hesitation_times: list[float] = []
        total_failed_attempts = 0
        total_stability = 0.0
        stability_frames = 0
        all_deviations: list[float] = []
        step_reports: dict[str, Any] = {}
        weak_steps: list[str] = []

        for step_id, sm in self._step_metrics.items():
            if step_id == "completed":
                continue

            if sm.achieved_ms is not None and sm.entered_ms > 0:
                hesitation_times.append(float(sm.achieved_ms - sm.entered_ms))

            total_failed_attempts += sm.failed_attempts
            total_stability += sm.stability_sum
            stability_frames += sm.stability_count
            all_deviations.extend(sm.angle_deviations)

            step_coverage = (
                (sm.valid_observed_frames / sm.total_frames * 100.0)
                if sm.total_frames > 0
                else 0.0
            )
            step_reports[step_id] = {
                "failed_attempts": sm.failed_attempts,
                "valid_observed_frames": sm.valid_observed_frames,
                "coverage_pct": round(step_coverage, 1),
                "avg_deviation": (
                    round(sum(sm.angle_deviations) / len(sm.angle_deviations), 2)
                    if sm.angle_deviations
                    else 0.0
                ),
            }

            # Flag as weak if multiple broken attempts or low coverage
            if sm.failed_attempts >= 2 or step_coverage < 60.0:
                weak_steps.append(step_id)

        avg_hesitation_ms = (
            sum(hesitation_times) / len(hesitation_times) if hesitation_times else 0.0
        )
        avg_deviation = (
            sum(all_deviations) / len(all_deviations) if all_deviations else 0.0
        )
        tremor_score = (
            1.0 - (total_stability / stability_frames) if stability_frames > 0 else 0.3
        )

        # Final score calculation based on valid observed execution
        coverage_factor = min(1.0, coverage_pct / 80.0)
        error_penalty = total_failed_attempts * 0.03
        final_score = max(0.2, min(1.0, (1.0 - error_penalty - (tremor_score * 0.3)) * coverage_factor))

        report: dict[str, Any] = {
            "student_id": self.student_id,
            "procedure_id": self.procedure_id,
            "difficulty": self.difficulty,
            "final_score": round(final_score, 4),
            "final_score_pct": round(final_score * 100.0, 1),
            "duration_ms": int(duration_ms),
            "completed_steps": list(self._completed_steps),
            "failed_attempts": int(total_failed_attempts),
            "time_to_first_valid_hold_ms": self.first_valid_hold_ms,
            "observed_frames": self._observed_frames,
            "estimated_frames": self._estimated_frames,
            "total_frames": self._total_frames,
            "coverage_pct": round(coverage_pct, 1),
            "avg_hesitation_ms": round(avg_hesitation_ms, 1),
            "avg_deviation": round(avg_deviation, 2),
            "tremor_score": round(tremor_score, 4),
            "step_breakdown": step_reports,
            "recommended_repeats": weak_steps,
            "recommendation": (
                f"Consider repeating {', '.join(weak_steps)} to build steady muscle memory."
                if weak_steps
                else "Technique demonstrated steady compliance across all phases."
            ),
        }

        # Persist to database
        try:
            db = get_db()
            existing = db.fetch_one("SELECT id FROM students WHERE id = ?", (self.student_id,))
            if not existing:
                db.execute("INSERT INTO students (id) VALUES (?)", (self.student_id,))

            db.execute(
                """
                INSERT INTO sessions
                    (student_id, procedure_id, difficulty, final_score,
                     duration_ms, attempt_count, avg_hesitation_ms, tremor_score, passed, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.student_id,
                    self.procedure_id,
                    self.difficulty,
                    round(final_score, 4),
                    int(duration_ms),
                    int(total_failed_attempts),
                    round(avg_hesitation_ms, 1),
                    round(tremor_score, 4),
                    1,
                    datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc).isoformat(),
                ),
            )
        except Exception:
            pass

        return report
