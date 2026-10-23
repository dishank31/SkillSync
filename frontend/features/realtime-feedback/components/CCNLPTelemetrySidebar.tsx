"use client";

import React, { useState } from "react";
import type { FrameResponse } from "../../../shared/lib/types";

interface CCNLPTelemetrySidebarProps {
  telemetry: FrameResponse | null;
  spokenTranscript: string;
  isListening: boolean;
  speechError?: string | null;
  onToggleListening: () => void;
  onClearTranscript: () => void;
  onSetTranscript?: (text: string) => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  onOpenSOPCompiler: () => void;
}

export default function CCNLPTelemetrySidebar({
  telemetry,
  spokenTranscript,
  isListening,
  speechError,
  onToggleListening,
  onClearTranscript,
  onSetTranscript,
  autoSpeak,
  onToggleAutoSpeak,
  onOpenSOPCompiler,
}: CCNLPTelemetrySidebarProps) {
  const [showDecayDetails, setShowDecayDetails] = useState(true);
  const [isEditingCallout, setIsEditingCallout] = useState(false);
  const [typedInput, setTypedInput] = useState("");

  const alignmentState = telemetry?.alignment_state || "SYNCHRONIZED_MASTERY";
  const pEntail = telemetry?.p_entailment ?? 0.0;
  const pNeut = telemetry?.p_neutral ?? 1.0;
  const pContra = telemetry?.p_contradiction ?? 0.0;
  const kinematicScore = telemetry?.kinematic_score ?? (telemetry?.score ?? 0.0);

  const contrastiveFeedback =
    telemetry?.contrastive_feedback ||
    (telemetry?.feedback?.[0]?.message ?? "Awaiting motion and verbal callout...");

  const cog24h = telemetry?.declarative_retention_24h ?? 82.0;
  const cog7d = telemetry?.declarative_retention_7d ?? 28.0;
  const motor24h = telemetry?.procedural_retention_24h ?? 86.0;
  const motor7d = telemetry?.procedural_retention_7d ?? 36.0;
  const intervention =
    telemetry?.intervention_recommendation ||
    "Maintain synchronized Think-Aloud verbal callouts with static posture holds.";

  const stateClassMap: Record<string, { label: string; cssClass: string }> = {
    SYNCHRONIZED_MASTERY: {
      label: "SYNCHRONIZED MASTERY",
      cssClass: "state--synchronized",
    },
    MOTOR_EXECUTION_DRIFT: {
      label: "MOTOR EXECUTION DRIFT",
      cssClass: "state--drift",
    },
    COGNITIVE_PROTOCOL_CONTRADICTION: {
      label: "PROTOCOL CONTRADICTION",
      cssClass: "state--contradiction",
    },
    SEMANTIC_HESITATION_OR_OMISSION: {
      label: "VERBAL HESITATION / OMISSION",
      cssClass: "state--hesitation",
    },
    DUAL_PATHWAY_FAILURE: {
      label: "DUAL-PATHWAY DRIFT",
      cssClass: "state--failure",
    },
  };

  const currentBadge = stateClassMap[alignmentState] || stateClassMap.SYNCHRONIZED_MASTERY;

  return (
    <div className="ccnlp-container">
      {/* 1. SOP Compiler Trigger Card */}
      <div className="ccnlp-sop-card">
        <div>
          <span className="ccnlp-sop-kicker">Academic CCNLP Engine</span>
          <span className="ccnlp-sop-title">Instructional SOP Compiler</span>
        </div>
        <button
          type="button"
          onClick={onOpenSOPCompiler}
          className="ccnlp-sop-btn"
          title="Open Frame-Semantic SOP to Kinematic Model Compiler"
        >
          <span>📜</span>
          <span>Compile SOP</span>
        </button>
      </div>

      {/* 2. Cognitive-Motor Alignment State Badge */}
      <div className={`ccnlp-align-card ${currentBadge.cssClass}`}>
        <div className="ccnlp-align-header">
          <span className="ccnlp-align-kicker">Cognitive-Motor Alignment</span>
          <span className="ccnlp-beacon-wrap">
            <span className="ccnlp-beacon-ring" />
            <span className="ccnlp-beacon-dot" />
          </span>
        </div>
        <div className="ccnlp-align-state-title">
          {currentBadge.label}
        </div>
        <div className="ccnlp-align-metrics-row">
          <span>Kinematic Score: <strong>{Math.round(kinematicScore * 100)}%</strong></span>
          <span>NLI Entail: <strong>{Math.round(pEntail * 100)}%</strong></span>
        </div>
      </div>

      {/* 3. Real-Time NLI Probability Spectrum (DeBERTa-v3) */}
      <div className="ccnlp-nli-card">
        <div className="ccnlp-nli-head">
          <h3>NLI Verbal Entailment</h3>
          <span className="ccnlp-model-chip">DeBERTa-v3</span>
        </div>

        <div className="ccnlp-spectrum-bars">
          {/* Entailment Bar */}
          <div className="ccnlp-bar-row">
            <div className="ccnlp-bar-labels">
              <span style={{ color: "#059669" }}>P(Entailment)</span>
              <span style={{ color: "#047857", fontFamily: "monospace" }}>
                {(pEntail * 100).toFixed(1)}%
              </span>
            </div>
            <div className="ccnlp-bar-track">
              <div
                className="ccnlp-bar-fill ccnlp-bar-fill--entail"
                style={{ width: `${Math.max(3, pEntail * 100)}%` }}
              />
            </div>
          </div>

          {/* Neutral Bar */}
          <div className="ccnlp-bar-row">
            <div className="ccnlp-bar-labels">
              <span style={{ color: "#0284c7" }}>P(Neutral)</span>
              <span style={{ color: "#0369a1", fontFamily: "monospace" }}>
                {(pNeut * 100).toFixed(1)}%
              </span>
            </div>
            <div className="ccnlp-bar-track">
              <div
                className="ccnlp-bar-fill ccnlp-bar-fill--neutral"
                style={{ width: `${Math.max(3, pNeut * 100)}%` }}
              />
            </div>
          </div>

          {/* Contradiction Bar */}
          <div className="ccnlp-bar-row">
            <div className="ccnlp-bar-labels">
              <span style={{ color: "#e11d48" }}>P(Contradiction)</span>
              <span style={{ color: "#be123c", fontFamily: "monospace" }}>
                {(pContra * 100).toFixed(1)}%
              </span>
            </div>
            <div className="ccnlp-bar-track">
              <div
                className="ccnlp-bar-fill ccnlp-bar-fill--contradict"
                style={{ width: `${Math.max(3, pContra * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Spoken Think-Aloud Callout & Microphone */}
      <div className="ccnlp-speech-card">
        <div className="ccnlp-speech-head">
          <div className="ccnlp-mic-group">
            <button
              type="button"
              onClick={onToggleListening}
              className={`ccnlp-mic-btn ${isListening ? "ccnlp-mic-btn--active" : ""}`}
              title={isListening ? "Mute Microphone" : "Enable Hands-Free Think-Aloud Speech"}
            >
              🎤
            </button>
            <span className="ccnlp-speech-title">Think-Aloud Callout</span>
          </div>

          <div className="ccnlp-speech-controls">
            <button
              type="button"
              onClick={onToggleAutoSpeak}
              className={`ccnlp-tts-pill ${autoSpeak ? "ccnlp-tts-pill--on" : ""}`}
              title="Toggle Audio Speech Synthesis for coaching"
            >
              TTS {autoSpeak ? "ON" : "OFF"}
            </button>
            {spokenTranscript && (
              <button
                type="button"
                onClick={onClearTranscript}
                className="ccnlp-clear-btn"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="ccnlp-transcript-box">
          {spokenTranscript ? (
            <span>"{spokenTranscript}"</span>
          ) : (
            <span className="ccnlp-transcript-placeholder">
              {isListening
                ? "Listening... e.g. 'I am holding the scalpel in pencil grip at 45 degrees'"
                : "Microphone paused. Click 🎤 to enable Think-Aloud."}
            </span>
          )}
        </div>
      </div>

      {/* 5. Contrastive Diagnostic NLG Banner */}
      <div className="ccnlp-diag-card">
        <div className="ccnlp-diag-head">
          <span className="ccnlp-diag-title">Contrastive Diagnostic NLG</span>
          {telemetry?.occlusion_reconstructed && (
            <span className="ccnlp-occlusion-chip">
              Coupled DIP Reconstructed
            </span>
          )}
        </div>

        <p className="ccnlp-diag-msg">
          {contrastiveFeedback}
        </p>

        {/* Joint Residuals Chips */}
        {telemetry?.joint_residuals && Object.keys(telemetry.joint_residuals).length > 0 && (
          <div className="ccnlp-residuals-row">
            {Object.entries(telemetry.joint_residuals).map(([joint, res]) => (
              <span
                key={joint}
                className={`ccnlp-residual-chip ${
                  Math.abs(res) <= 8 ? "ccnlp-residual-chip--ok" : "ccnlp-residual-chip--warn"
                }`}
              >
                {joint.replace("_angle", "")}: {res > 0 ? `+${res}` : res}°
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 6. Dual-Memory Skill Decay Card */}
      <div className="ccnlp-decay-card">
        <div className="ccnlp-decay-head">
          <span className="ccnlp-decay-title">Dual-Memory Retention Curves</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="ccnlp-formula-chip">Ebbinghaus R(t)=e^(-t/S)</span>
            <button
              type="button"
              onClick={() => setShowDecayDetails((prev) => !prev)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                color: "#64748b",
                padding: "0 2px",
              }}
              title="Toggle Retention Details"
            >
              {showDecayDetails ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {showDecayDetails && (
          <>
            <div className="ccnlp-decay-grid">
              {/* Cognitive Retention */}
              <div className="ccnlp-decay-box">
                <span className="ccnlp-decay-box-label ccnlp-decay-box-label--cog">
                  Declarative Cognitive
                </span>
                <div className="ccnlp-decay-stat">
                  24h: <span>{cog24h}%</span>
                </div>
                <div className="ccnlp-decay-stat-sub">
                  7d: <strong style={{ color: "#334155" }}>{cog7d}%</strong>
                </div>
              </div>

              {/* Procedural Motor Retention */}
              <div className="ccnlp-decay-box">
                <span className="ccnlp-decay-box-label ccnlp-decay-box-label--motor">
                  Procedural Motor
                </span>
                <div className="ccnlp-decay-stat">
                  24h: <span>{motor24h}%</span>
                </div>
                <div className="ccnlp-decay-stat-sub">
                  7d: <strong style={{ color: "#334155" }}>{motor7d}%</strong>
                </div>
              </div>
            </div>

            {/* Targeted Pedagogical Intervention */}
            <div className="ccnlp-recommendation-box">
              <strong>Recommendation:</strong>
              {intervention}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
