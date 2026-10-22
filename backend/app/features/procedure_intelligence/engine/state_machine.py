"""
Procedure state machine with monotonic dwell-time gating and safety guards.

Rules:
- Hold timer only advances on VALID, OBSERVED, IN-RANGE frames.
- Estimated, stale, or tracking-lost frames pause or reset the hold timer.
- MCP out-of-range guard: if MCP angle is out of range for > 3.0s, resets session.
"""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Final

from app.features.procedure_intelligence.engine.schema import load_procedure_schema


@dataclass
class SessionState:
    current_step_id: str
    step_valid_since_ms: int | None = None
    last_observed_valid_ms: int | None = None
    step_invalid_since_ms: int | None = None
    mcp_out_of_range_since_ms: int | None = None
    step_entered_at_ms: int | None = None
    transition_grace_until_ms: int | None = None
    completed: bool = False


SESSIONS: Final[dict[str, SessionState]] = {}


def _now_ms() -> int:
    return int(time.monotonic() * 1000)


@dataclass(frozen=True)
class StepUpdate:
    step_started: str
    step_now: str
    advanced: bool
    step_valid_since_ms: int | None
    dwell_remaining_ms: int
    completed: bool
    reset: bool = False


def get_session_state(
    *,
    procedure_id: str = "soldering_practice",
    session_key: str | None = None,
) -> SessionState:
    schema = load_procedure_schema(procedure_id)
    steps_by_id = schema.step_by_id()

    key = session_key or procedure_id
    state = SESSIONS.get(key)
    if state is None or state.current_step_id not in steps_by_id:
        state = SessionState(current_step_id=schema.steps[0].id, step_entered_at_ms=_now_ms())
        SESSIONS[key] = state
    return state


def reset_session(
    *,
    procedure_id: str = "soldering_practice",
    session_key: str | None = None,
) -> SessionState:
    """Reset a procedure session back to the first step."""
    schema = load_procedure_schema(procedure_id)
    key = session_key or procedure_id
    state = SessionState(current_step_id=schema.steps[0].id, step_entered_at_ms=_now_ms())
    SESSIONS[key] = state
    return state


def update_step(
    *,
    procedure_id: str = "soldering_practice",
    session_key: str | None = None,
    valid_constraints: bool,
    is_observed: bool = True,
    mcp_in_range: bool | None = None,
    timestamp_ms: int | None = None,
    now_ms: int | None = None,
) -> StepUpdate:
    """Update dwell-time timing for the current step and possibly advance.

    Guarantees:
    - Hold timer ONLY advances when both valid_constraints is True AND is_observed is True.
    - If is_observed is False (occluded/estimated), timer pauses.
    - If valid_constraints is False, timer resets.
    """
    schema = load_procedure_schema(procedure_id)
    steps_by_id = schema.step_by_id()

    state = get_session_state(procedure_id=procedure_id, session_key=session_key)
    step_started = state.current_step_id
    step_schema = steps_by_id[step_started]

    t_ms = (
        timestamp_ms
        if timestamp_ms is not None
        else (_now_ms() if now_ms is None else now_ms)
    )

    # Transition adjustment grace period: allow the learner time to reposition their hand
    in_transition_grace = (
        state.transition_grace_until_ms is not None
        and int(t_ms) < state.transition_grace_until_ms
    )

    if in_transition_grace:
        # User is actively transitioning; do not accumulate MCP out-of-range safety violation
        state.mcp_out_of_range_since_ms = None
        # If user achieves valid pose during grace period, end grace immediately so dwell starts
        if valid_constraints and is_observed:
            state.transition_grace_until_ms = None
    else:
        if state.transition_grace_until_ms is not None:
            state.transition_grace_until_ms = None

        # Global safety constraint: if MCP is continuously out of range for 3s
        if mcp_in_range is False:
            if state.mcp_out_of_range_since_ms is None:
                state.mcp_out_of_range_since_ms = int(t_ms)
            if int(t_ms - state.mcp_out_of_range_since_ms) >= 3000:
                state.current_step_id = schema.steps[0].id
                state.step_valid_since_ms = None
                state.step_invalid_since_ms = None
                state.mcp_out_of_range_since_ms = None
                state.transition_grace_until_ms = None
                state.completed = False
                return StepUpdate(
                    step_started=step_started,
                    step_now=state.current_step_id,
                    advanced=False,
                    step_valid_since_ms=state.step_valid_since_ms,
                    dwell_remaining_ms=0,
                    completed=state.completed,
                    reset=True,
                )
        elif mcp_in_range is True:
            state.mcp_out_of_range_since_ms = None

    # Tracking lost or estimated frames must NEVER advance the hold timer
    if not is_observed or not valid_constraints:
        if not valid_constraints:
            state.step_valid_since_ms = None
            state.step_invalid_since_ms = None

        state.completed = state.current_step_id == "completed"
        dwell_ms = int(step_schema.dwell_time_ms)
        remaining = dwell_ms
        if state.step_valid_since_ms is not None:
            elapsed = int(t_ms - state.step_valid_since_ms)
            remaining = max(0, dwell_ms - elapsed)

        return StepUpdate(
            step_started=step_started,
            step_now=state.current_step_id,
            advanced=False,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=remaining,
            completed=state.completed,
            reset=False,
        )

    # Frame is both valid AND observed
    if state.step_valid_since_ms is None:
        state.step_valid_since_ms = int(t_ms)
    state.last_observed_valid_ms = int(t_ms)
    state.step_invalid_since_ms = None

    dwell_ms = int(step_schema.dwell_time_ms)
    if dwell_ms <= 0:
        nxt = step_schema.next_step
        advanced = nxt != step_started
        state.current_step_id = nxt
        state.step_valid_since_ms = None
        state.step_invalid_since_ms = None
        if advanced:
            state.mcp_out_of_range_since_ms = None
            state.step_entered_at_ms = int(t_ms)
            state.transition_grace_until_ms = int(t_ms) + 6000
        state.completed = nxt == "completed"
        return StepUpdate(
            step_started=step_started,
            step_now=nxt,
            advanced=advanced,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=0,
            completed=state.completed,
            reset=False,
        )

    elapsed_ms = int(t_ms - state.step_valid_since_ms)
    remaining_ms = dwell_ms - elapsed_ms
    if remaining_ms > 0:
        state.completed = state.current_step_id == "completed"
        return StepUpdate(
            step_started=step_started,
            step_now=state.current_step_id,
            advanced=False,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=int(remaining_ms),
            completed=state.completed,
            reset=False,
        )

    nxt = step_schema.next_step
    advanced = nxt != step_started
    state.current_step_id = nxt
    state.step_valid_since_ms = None
    state.step_invalid_since_ms = None
    if advanced:
        state.mcp_out_of_range_since_ms = None
        state.step_entered_at_ms = int(t_ms)
        state.transition_grace_until_ms = int(t_ms) + 6000
    state.completed = nxt == "completed"
    return StepUpdate(
        step_started=step_started,
        step_now=nxt,
        advanced=advanced,
        step_valid_since_ms=state.step_valid_since_ms,
        dwell_remaining_ms=0,
        completed=state.completed,
        reset=False,
    )


def get_current_step_id(
    *,
    procedure_id: str = "soldering_practice",
    session_key: str | None = None,
) -> str:
    return get_session_state(procedure_id=procedure_id, session_key=session_key).current_step_id
