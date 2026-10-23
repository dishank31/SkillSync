from __future__ import annotations

import time
from typing import Any
from fastapi import APIRouter

from app.core.settings import get_settings
from app.features.health.detailed import run_detailed_health_check

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
@router.get("/")
def health() -> dict[str, Any]:
    """Lightweight liveness check that never locks camera or heavy resources."""
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "timestamp": time.time(),
    }


@router.get("/detailed")
def detailed_health() -> dict[str, Any]:
    """Comprehensive readiness report checking models, sessions, and modules."""
    return run_detailed_health_check()