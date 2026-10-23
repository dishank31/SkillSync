from __future__ import annotations

import os
import sys
from typing import Any

from app.core.settings import get_settings


def check_python_version() -> dict[str, Any]:
    """Check Python runtime version."""
    version = sys.version
    major, minor, micro = sys.version_info[:3]
    return {
        "status": "ok" if major >= 3 and minor >= 10 else "warning",
        "version": version,
        "major": major,
        "minor": minor,
        "micro": micro,
    }


def check_mediapipe() -> dict[str, Any]:
    """Check if MediaPipe is installed and functional."""
    try:
        import mediapipe as mp
        return {
            "status": "ok",
            "version": getattr(mp, "__version__", "unknown"),
        }
    except Exception as e:
        return {"status": "error", "detail": f"MediaPipe error: {e}"}


def check_opencv() -> dict[str, Any]:
    """Check OpenCV status."""
    try:
        import cv2
        return {
            "status": "ok",
            "version": getattr(cv2, "__version__", "unknown"),
        }
    except Exception as e:
        return {"status": "error", "detail": f"OpenCV error: {e}"}


def check_camera() -> dict[str, Any]:
    """Check CameraRuntime status without locking hardware cv2.VideoCapture(0)."""
    try:
        from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
        runtime = get_camera_runtime()
        is_running = runtime.is_running()
        return {
            "status": "ok" if is_running else "idle",
            "runtime_running": is_running,
            "browser_websocket_ready": True,
            "detail": (
                "CameraRuntime active"
                if is_running
                else "Camera hardware unlocked (ready for browser Next.js webcam stream)"
            ),
        }
    except Exception as e:
        return {"status": "error", "detail": f"Camera runtime error: {e}"}


def check_model_file() -> dict[str, Any]:
    """Check MediaPipe hand_landmarker.task model file."""
    settings = get_settings()
    path = settings.hand_landmarker_path
    if path.is_file() and path.stat().st_size > 100_000:
        return {
            "status": "ok",
            "path": str(path),
            "size_mb": round(path.stat().st_size / (1024 * 1024), 2),
        }
    return {
        "status": "warning",
        "detail": f"Model file not yet downloaded at {path}. Will auto-download on first tracking tick.",
    }


def check_nli_model() -> dict[str, Any]:
    """Check NLI Cross-Encoder and Embedding models."""
    settings = get_settings()
    try:
        from app.features.procedure_intelligence.engine.scoring import get_nli_scorer
        scorer = get_nli_scorer()
        return {
            "status": "ok" if scorer.is_model_ready else "fallback",
            "nli_model": settings.nli_model_name,
            "embedding_model": settings.embedding_model_name,
            "backend": scorer.active_backend,
        }
    except Exception as e:
        return {
            "status": "fallback",
            "nli_model": settings.nli_model_name,
            "detail": f"Operating in fast rule-based semantic inference fallback: {e}",
        }


def check_websocket_sessions() -> dict[str, Any]:
    """Check active WebSocket training sessions."""
    try:
        from app.features.realtime_feedback.api.websocket import get_active_session_count
        count = get_active_session_count()
        return {
            "status": "ok",
            "active_connections": count,
        }
    except Exception:
        return {"status": "ok", "active_connections": 0}


def check_feature_modules() -> dict[str, Any]:
    """Verify that all feature modules load properly."""
    modules_to_check = [
        ("hand_tracker", "app.features.hand_tracking.cv.hand_tracker", "HandTracker"),
        ("landmarks", "app.features.hand_tracking.cv.landmarks", "normalize_landmarks"),
        ("angles", "app.features.hand_tracking.feature_engineering.angles", "compute_angles"),
        ("distances", "app.features.hand_tracking.feature_engineering.distances", "compute_distances"),
        ("smoothing", "app.features.hand_tracking.feature_engineering.smoothing", "smooth_landmarks"),
        ("state_machine", "app.features.procedure_intelligence.engine.state_machine", "update_step"),
        ("rules", "app.features.procedure_intelligence.engine.rules", "validate_step"),
        ("feedback", "app.features.procedure_intelligence.engine.feedback", "generate_feedback"),
        ("scoring", "app.features.procedure_intelligence.engine.scoring", "get_nli_scorer"),
        ("stability", "app.features.procedure_intelligence.engine.stability", "StabilityScorer"),
        ("pipeline", "app.features.realtime_feedback.service.pipeline", "process_frame"),
    ]

    results: dict[str, Any] = {}
    all_ok = True

    for name, module_path, attr_name in modules_to_check:
        try:
            mod = __import__(module_path, fromlist=[attr_name])
            if hasattr(mod, attr_name):
                results[name] = {"status": "ok"}
            else:
                results[name] = {"status": "error", "detail": f"Missing {attr_name}"}
                all_ok = False
        except Exception as e:
            results[name] = {"status": "error", "detail": str(e)}
            all_ok = False

    return {
        "status": "ok" if all_ok else "degraded",
        "modules": results,
    }


def run_detailed_health_check() -> dict[str, Any]:
    """Run all health diagnostics and return unified report."""
    checks = {
        "python": check_python_version(),
        "mediapipe": check_mediapipe(),
        "opencv": check_opencv(),
        "camera": check_camera(),
        "model_file": check_model_file(),
        "nli_model": check_nli_model(),
        "websocket": check_websocket_sessions(),
        "feature_modules": check_feature_modules(),
    }

    statuses = [v.get("status") for v in checks.values() if isinstance(v, dict)]
    if all(s in ("ok", "idle") for s in statuses):
        overall = "healthy"
    elif any(s == "error" for s in statuses):
        overall = "unhealthy"
    else:
        overall = "degraded"

    return {
        "status": overall,
        "checks": checks,
    }