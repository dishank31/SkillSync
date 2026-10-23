"use client";

import React, { useState } from "react";
import type { FrameResponse } from "../../../shared/lib/types";

interface CCNLPTelemetrySidebarProps {
  telemetry: FrameResponse | null;
  spokenTranscript: string;
  isListening: boolean;
  onToggleListening: () => void;
  onClearTranscript: () => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  onOpenSOPCompiler: () => void;
}

export default function CCNLPTelemetrySidebar({
  telemetry,
  spokenTranscript,
  isListening,
  onToggleListening,
  onClearTranscript,
  autoSpeak,
  onToggleAutoSpeak,
  onOpenSOPCompiler,
}: CCNLPTelemetrySidebarProps) {
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

  // Alignment State badge styles
  const stateBadgeMap: Record<string, { label: string; bg: string; text: string; border: string }> = {
    SYNCHRONIZED_MASTERY: {
      label: "SYNCHRONIZED MASTERY",
      bg: "bg-emerald-950/80",
      text: "text-emerald-300",
      border: "border-emerald-500/60",
    },
    MOTOR_EXECUTION_DRIFT: {
      label: "MOTOR EXECUTION DRIFT",
      bg: "bg-amber-950/80",
      text: "text-amber-300",
      border: "border-amber-500/60",
    },
    COGNITIVE_PROTOCOL_CONTRADICTION: {
      label: "PROTOCOL CONTRADICTION",
      bg: "bg-rose-950/80",
      text: "text-rose-300",
      border: "border-rose-500/60",
    },
    SEMANTIC_HESITATION_OR_OMISSION: {
      label: "VERBAL HESITATION / OMISSION",
      bg: "bg-sky-950/80",
      text: "text-sky-300",
      border: "border-sky-500/60",
    },
    DUAL_PATHWAY_FAILURE: {
      label: "DUAL-PATHWAY DRIFT",
      bg: "bg-slate-900/80",
      text: "text-slate-400",
      border: "border-slate-700",
    },
  };

  const currentBadge = stateBadgeMap[alignmentState] || stateBadgeMap.SYNCHRONIZED_MASTERY;

  return (
    <div className="w-full flex flex-col gap-4 text-slate-100">
      {/* SOP Compiler Trigger Card */}
      <div className="p-3.5 bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-800/60 rounded-xl flex items-center justify-between shadow-lg">
        <div>
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
            Academic CCNLP Engine
          </span>
          <span className="text-xs font-semibold text-white">
            Instructional SOP Compiler
          </span>
        </div>
        <button
          onClick={onOpenSOPCompiler}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow-md transition flex items-center gap-1.5"
        >
          <span>📜</span>
          <span>Compile SOP</span>
        </button>
      </div>

      {/* 1. Cognitive-Motor Alignment State Badge */}
      <div
        className={`p-3 rounded-xl border ${currentBadge.border} ${currentBadge.bg} transition-all duration-300 shadow-md`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cognitive-Motor Alignment
          </span>
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                alignmentState === "SYNCHRONIZED_MASTERY"
                  ? "bg-emerald-400"
                  : alignmentState === "MOTOR_EXECUTION_DRIFT"
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                alignmentState === "SYNCHRONIZED_MASTERY"
                  ? "bg-emerald-500"
                  : alignmentState === "MOTOR_EXECUTION_DRIFT"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
            ></span>
          </span>
        </div>
        <div className={`text-sm font-extrabold tracking-wide ${currentBadge.text}`}>
          {currentBadge.label}
        </div>
        <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
          <span>Kinematic Score: {Math.round(kinematicScore * 100)}%</span>
          <span>NLI Entail: {Math.round(pEntail * 100)}%</span>
        </div>
      </div>

      {/* 2. Real-Time NLI Probability Spectrum */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            NLI Verbal Entailment
          </span>
          <span className="text-[10px] font-mono text-indigo-400">
            DeBERTa-v3
          </span>
        </div>

        {/* Entailment Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-emerald-400 font-medium">P(Entailment)</span>
            <span className="font-mono text-emerald-300 font-semibold">
              {(pEntail * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, pEntail * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Neutral Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-sky-400 font-medium">P(Neutral)</span>
            <span className="font-mono text-sky-300 font-semibold">
              {(pNeut * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, pNeut * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Contradiction Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-rose-400 font-medium">P(Contradiction)</span>
            <span className="font-mono text-rose-300 font-semibold">
              {(pContra * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, pContra * 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* 3. Spoken Think-Aloud Callout & Microphone */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleListening}
              className={`p-1.5 rounded-lg border transition ${
                isListening
                  ? "bg-rose-900/60 border-rose-600 text-rose-300 animate-pulse"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
              }`}
              title={isListening ? "Mute Microphone" : "Enable Hands-Free Think-Aloud Speech"}
            >
              🎤
            </button>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Think-Aloud Callout
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutoSpeak}
              className={`text-[10px] px-2 py-0.5 rounded border transition ${
                autoSpeak
                  ? "bg-indigo-900/60 border-indigo-600 text-indigo-300"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
              title="Toggle Audio Speech Synthesis for coaching"
            >
              TTS {autoSpeak ? "ON" : "OFF"}
            </button>
            {spokenTranscript && (
              <button
                onClick={onClearTranscript}
                className="text-[10px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="min-h-[44px] p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono text-slate-200">
          {spokenTranscript ? (
            <span>"{spokenTranscript}"</span>
          ) : (
            <span className="text-slate-500 italic">
              {isListening
                ? "Listening... Say: 'I am holding the scalpel in pencil grip at 45 degrees'"
                : "Microphone paused. Click 🎤 to enable Think-Aloud."}
            </span>
          )}
        </div>
      </div>

      {/* 4. Contrastive Diagnostic NLG Banner */}
      <div className="p-3.5 bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-800/40 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
            Contrastive Diagnostic NLG
          </span>
          {telemetry?.occlusion_reconstructed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
              Coupled DIP Reconstructed
            </span>
          )}
        </div>

        <p className="text-xs text-slate-200 leading-relaxed font-sans">
          {contrastiveFeedback}
        </p>

        {/* Joint Residuals Chips */}
        {telemetry?.joint_residuals && Object.keys(telemetry.joint_residuals).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(telemetry.joint_residuals).map(([joint, res]) => (
              <span
                key={joint}
                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                  Math.abs(res) <= 8
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                    : "bg-amber-950/80 text-amber-300 border border-amber-800"
                }`}
              >
                {joint.replace("_angle", "")}: {res > 0 ? `+${res}` : res}°
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 5. Dual-Memory Skill Decay Cards */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Dual-Memory Retention Curves
          </span>
          <span className="text-[10px] text-slate-400">Ebbinghaus R(t)=e^(-t/S)</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          {/* Cognitive Retention */}
          <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-[10px] text-indigo-300 font-semibold block mb-1">
              Declarative Cognitive
            </span>
            <div className="text-xs font-bold text-white">
              24h: <span className="text-emerald-400">{cog24h}%</span>
            </div>
            <div className="text-[11px] text-slate-400">
              7d: <span className="text-slate-300 font-mono">{cog7d}%</span>
            </div>
          </div>

          {/* Procedural Motor Retention */}
          <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-[10px] text-emerald-300 font-semibold block mb-1">
              Procedural Motor
            </span>
            <div className="text-xs font-bold text-white">
              24h: <span className="text-emerald-400">{motor24h}%</span>
            </div>
            <div className="text-[11px] text-slate-400">
              7d: <span className="text-slate-300 font-mono">{motor7d}%</span>
            </div>
          </div>
        </div>

        {/* Targeted Pedagogical Intervention */}
        <div className="p-2 bg-slate-950 rounded border border-slate-800/80 text-[11px] text-slate-300 leading-snug">
          <span className="text-amber-400 font-bold block mb-0.5">Recommendation:</span>
          {intervention}
        </div>
      </div>
    </div>
  );
}
