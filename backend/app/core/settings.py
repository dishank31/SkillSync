from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Unified application settings and model path configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core Application
    app_name: str = "SkillSync Multi-Modal Engine"
    app_version: str = "0.2.0"
    environment: str = "development"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = ["*"]

    # Camera Runtime
    camera_fps: int = 30
    camera_device_index: int = 0
    auto_start_camera: bool = False
    smoothing_window: int = 5

    # Storage & DB
    database_url: str = "sqlite:///./skillsync.db"

    # Computer Vision Models
    hand_landmarker_filename: str = "hand_landmarker.task"
    hand_landmarker_url: str = (
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
        "hand_landmarker/float16/1/hand_landmarker.task"
    )
    model_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent
        / "features"
        / "hand_tracking"
        / "cv"
    )

    @property
    def hand_landmarker_path(self) -> Path:
        return self.model_dir / self.hand_landmarker_filename

    # Multimodal NLP Models
    nli_model_name: str = "cross-encoder/nli-deberta-v3-small"
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    nlp_cache_dir: Path = Field(
        default_factory=lambda: Path(os.getenv("HF_HOME", "./model_cache/huggingface"))
    )

    # Procedure Intelligence & Ontology
    ontology_path: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent
        / "features"
        / "procedure_intelligence"
        / "engine"
        / "ontology.json"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton Settings instance."""
    return Settings()
