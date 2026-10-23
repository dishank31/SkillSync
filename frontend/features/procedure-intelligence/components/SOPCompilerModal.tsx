"use client";

import React, { useState } from "react";
import { API_URL_PREFIX } from "../../../shared/lib/constants";
import type { SOPCompilerResult } from "../../../shared/lib/types";

interface SOPCompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProcedure: (procedureId: string, procedureName?: string) => void;
  initialPreset?: keyof typeof PRESET_SOPS | string;
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
  initialPreset = "surgical_scalpel",
}: SOPCompilerModalProps) {
  const [sopText, setSopText] = useState(PRESET_SOPS.surgical_scalpel);
  const [procedureId, setProcedureId] = useState("custom_surgical_sop");
  const [isCompiling, setIsCompiling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<SOPCompilerResult | null>(null);

  React.useEffect(() => {
    if (initialPreset && PRESET_SOPS[initialPreset as keyof typeof PRESET_SOPS]) {
      setSopText(PRESET_SOPS[initialPreset as keyof typeof PRESET_SOPS]);
      setProcedureId(`${initialPreset}_custom`);
      setCompileResult(null);
      setErrorMsg(null);
    }
  }, [initialPreset, isOpen]);

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
    <div className="sop-modal-backdrop" onClick={onClose}>
      <div className="sop-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sop-modal-head">
          <div className="sop-modal-head-left">
            <span className="sop-step-badge" style={{ color: "#38bdf8", fontSize: "16px" }}>
              📜
            </span>
            <div>
              <h2 className="sop-modal-title">
                Frame-Semantic SOP-to-Kinematic Compiler
              </h2>
              <p className="sop-modal-subtitle">
                Academic CCNLP Engine: Parse freeform SOP text into 3D joint bounds & NLI hypotheses
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sop-modal-close-btn"
            title="Close Modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="sop-modal-body">
          {/* Preset Buttons */}
          <div className="sop-presets-row">
            <span className="sop-presets-label">Instruction Presets:</span>
            <button
              type="button"
              onClick={() => {
                setSopText(PRESET_SOPS.surgical_scalpel);
                setProcedureId("surgical_scalpel_custom");
              }}
              className="sop-preset-btn"
            >
              Scalpel Incision (Bard-Parker)
            </button>
            <button
              type="button"
              onClick={() => {
                setSopText(PRESET_SOPS.laboratory_pipette);
                setProcedureId("lab_pipette_custom");
              }}
              className="sop-preset-btn"
            >
              Laboratory Micropipetting
            </button>
            <button
              type="button"
              onClick={() => {
                setSopText(PRESET_SOPS.electronic_soldering);
                setProcedureId("soldering_practice_custom");
              }}
              className="sop-preset-btn"
            >
              Precision Soldering
            </button>
          </div>

          {/* Procedure ID Input */}
          <div className="sop-input-group">
            <label className="sop-input-label">Procedure Identifier</label>
            <input
              type="text"
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              className="sop-text-input"
              placeholder="e.g. surgical_scalpel_procedure"
            />
          </div>

          {/* SOP Paragraph Input */}
          <div className="sop-input-group">
            <label className="sop-input-label">Raw Instructional SOP Paragraph (English)</label>
            <textarea
              rows={4}
              value={sopText}
              onChange={(e) => setSopText(e.target.value)}
              className="sop-textarea"
              placeholder="Enter procedural steps e.g. Step 1: Hold scalpel like a pencil at 45 degrees. Hold 3 seconds..."
            />
          </div>

          {/* Compile Button */}
          <div className="sop-actions-row">
            <button
              type="button"
              onClick={handleCompile}
              disabled={isCompiling || !sopText.trim()}
              className="sop-btn-primary"
            >
              {isCompiling ? (
                <>⏳ Compiling Semantic Frame Graph...</>
              ) : (
                <>⚡ Compile SOP to Kinematic Graph</>
              )}
            </button>

            {compileResult && (
              <button
                type="button"
                onClick={handleActivate}
                className="sop-btn-success"
              >
                ✓ Activate for Live Training
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="sop-error-banner">
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Compilation Results Visualizer */}
          {compileResult && (
            <div className="sop-results-section">
              <h3 className="sop-results-title">
                Extracted Frame-Semantic Action Tuples ({compileResult.frame_semantics.length} Steps)
              </h3>

              <div className="sop-tuples-grid">
                {compileResult.frame_semantics.map((tuple) => (
                  <div key={tuple.step_index} className="sop-tuple-card">
                    <div className="sop-tuple-head">
                      <span className="sop-step-badge">Step {tuple.step_index}</span>
                      <span className="sop-dwell-badge">Hold: {tuple.hold_duration_sec}s</span>
                    </div>

                    <p className="sop-tuple-raw">
                      "{tuple.raw_text}"
                    </p>

                    <div className="sop-tuple-tags-grid">
                      <div>
                        <span className="sop-tag-label">Predicate:</span>
                        <span className="sop-tag-val sop-tag-val--pred">{tuple.action_predicate}</span>
                      </div>
                      <div>
                        <span className="sop-tag-label">Articulator:</span>
                        <span className="sop-tag-val sop-tag-val--art">{tuple.anatomical_articulator}</span>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <span className="sop-tag-label">Qualifier:</span>
                        <span className="sop-tag-val sop-tag-val--qual">{tuple.kinematic_qualifier}</span>
                      </div>
                    </div>

                    {/* Verbal hypothesis */}
                    <div className="sop-tuple-hypothesis">
                      <span className="sop-tuple-hypothesis-title">
                        Think-Aloud Verbal Hypothesis:
                      </span>
                      <span style={{ fontStyle: "italic", fontFamily: "monospace" }}>
                        "{tuple.verbal_hypothesis}"
                      </span>
                    </div>

                    {/* Resolved joint angle bounds */}
                    {Object.keys(tuple.target_angles).length > 0 && (
                      <div>
                        <span className="sop-tuple-bounds-title">Target 3D Joint Bounds:</span>
                        <div className="sop-bounds-chips">
                          {Object.entries(tuple.target_angles).map(([joint, b]) => (
                            <span key={joint} className="sop-bound-chip">
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
