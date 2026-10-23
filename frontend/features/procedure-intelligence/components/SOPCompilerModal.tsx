"use client";

import React, { useState } from "react";
import { API_URL_PREFIX } from "../../../shared/lib/constants";
import type { SOPCompilerResult } from "../../../shared/lib/types";

interface SOPCompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProcedure: (procedureId: string, procedureName?: string) => void;
}

const PRESET_SOPS = {
  surgical_scalpel: `Step 1: Grip the surgical scalpel in a precision pencil grip at 45 degrees relative to the incision surface. Hold steadily for 3.0 seconds.
Step 2: Transition to a dinner knife grip with the index finger extended fully along the dorsal spine for deep tissue sweep cutting. Maintain hold for 3.5 seconds.`,
  laboratory_pipette: `Step 1: Hold the micropipette upright in a cylindrical dispense grip with all fingers wrapped around the shaft. Hold for 2.5 seconds.
Step 2: Press the thumb down to the first stop while maintaining a steady wrist angle for 3.0 seconds.`,
  electronic_soldering: `Step 1: Approach the soldering work pad with the iron in a three-point pencil grip angled at 45 degrees. Hold for 2.0 seconds.
Step 2: Stabilize the index PIP joint flexion and rest the heel of the hand for 3.0 seconds during thermal transfer.`,
};

export default function SOPCompilerModal({
  isOpen,
  onClose,
  onSelectProcedure,
}: SOPCompilerModalProps) {
  const [sopText, setSopText] = useState(PRESET_SOPS.surgical_scalpel);
  const [procedureId, setProcedureId] = useState("custom_surgical_sop");
  const [isCompiling, setIsCompiling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<SOPCompilerResult | null>(null);

  if (!isOpen) return null;

  const handleCompile = async () => {
    if (!sopText.trim()) return;
    setIsCompiling(true);
    setErrorMsg(null);
    try {
      const cleanId = procedureId.trim().toLowerCase().replace(/\s+/g, "_") || "custom_sop";
      const res = await fetch(`${API_URL_PREFIX}/api/procedures/compile-sop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sop_text: sopText,
          procedure_id: cleanId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Compiler API returned HTTP ${res.status}`);
      }

      const data: SOPCompilerResult = await res.json();
      setCompileResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to compile SOP instructions");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleActivate = () => {
    if (!compileResult) return;
    const pid = compileResult.procedure_schema.procedure_id;
    onSelectProcedure(pid, `Custom SOP: ${pid}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Frame-Semantic SOP-to-Kinematic Compiler
              </h2>
              <p className="text-xs text-slate-400">
                CCNLP Pillar 1: Parse English SOP text into 3D joint bounds & NLI hypotheses
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Presets:
            </span>
            <button
              onClick={() => {
                setSopText(PRESET_SOPS.surgical_scalpel);
                setProcedureId("surgical_scalpel_custom");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Scalpel Incision (Bard-Parker)
            </button>
            <button
              onClick={() => {
                setSopText(PRESET_SOPS.laboratory_pipette);
                setProcedureId("lab_pipette_custom");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Laboratory Micropipetting
            </button>
            <button
              onClick={() => {
                setSopText(PRESET_SOPS.electronic_soldering);
                setProcedureId("soldering_practice_custom");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Precision Soldering
            </button>
          </div>

          {/* Procedure ID Input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Procedure Identifier
            </label>
            <input
              type="text"
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
              placeholder="e.g. surgical_scalpel_procedure"
            />
          </div>

          {/* SOP Paragraph Input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Raw Instructional SOP Paragraph (English)
            </label>
            <textarea
              rows={5}
              value={sopText}
              onChange={(e) => setSopText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed font-mono"
              placeholder="Enter procedural steps e.g. Step 1: Hold scalpel like a pencil at 45 degrees. Hold 3 seconds..."
            />
          </div>

          {/* Compile Button */}
          <div className="flex justify-between items-center">
            <button
              onClick={handleCompile}
              disabled={isCompiling || !sopText.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isCompiling ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Compiling Semantic Frame Graph...
                </>
              ) : (
                <>Compile SOP to Kinematic Graph</>
              )}
            </button>

            {compileResult && (
              <button
                onClick={handleActivate}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/30 transition flex items-center gap-2"
              >
                ✓ Activate for Live Training
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-lg text-xs">
              {errorMsg}
            </div>
          )}

          {/* Compilation Results Visualizer */}
          {compileResult && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                <span>Extracted Frame-Semantic Action Tuples ({compileResult.frame_semantics.length} Steps)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {compileResult.frame_semantics.map((tuple) => (
                  <div
                    key={tuple.step_index}
                    className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                        Step {tuple.step_index}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        Dwell: {tuple.hold_duration_sec}s
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 font-medium italic">
                      "{tuple.raw_text}"
                    </p>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-400">Predicate:</span>{" "}
                        <span className="text-emerald-300 font-mono font-semibold">
                          {tuple.action_predicate}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Articulator:</span>{" "}
                        <span className="text-amber-300 font-mono font-semibold">
                          {tuple.anatomical_articulator}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400">Qualifier:</span>{" "}
                        <span className="text-sky-300 font-mono">
                          {tuple.kinematic_qualifier}
                        </span>
                      </div>
                    </div>

                    {/* Verbal hypothesis */}
                    <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-[11px]">
                      <span className="text-slate-400 font-medium block mb-0.5">
                        Think-Aloud Verbal Hypothesis:
                      </span>
                      <span className="text-slate-200 italic font-mono">
                        "{tuple.verbal_hypothesis}"
                      </span>
                    </div>

                    {/* Resolved joint angle bounds */}
                    {Object.keys(tuple.target_angles).length > 0 && (
                      <div className="text-[11px] space-y-1">
                        <span className="text-slate-400 block font-medium">Target 3D Joint Bounds:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(tuple.target_angles).map(([joint, b]) => (
                            <span
                              key={joint}
                              className="px-2 py-0.5 bg-slate-900 rounded border border-slate-700 text-indigo-300 font-mono"
                            >
                              {joint.replace("_angle", "")}: {b.min}°–{b.max}°
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
