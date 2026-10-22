"use client";

import { useMemo, useState } from "react";
import { getStepTemplate, StepTemplate } from "../processing/stepTemplates";

interface TranslucentHandGuideProps {
  stepId?: string;
  isSynced: boolean;
  syncProgress: number; // 0 to 1 (0 to 1000ms hold progress)
  alignmentPercent?: number; // 0 to 100%
  showGhost: boolean;
  showPid: boolean;
  onToggleGhost: () => void;
  onTogglePid: () => void;
}

export default function TranslucentHandGuide({
  stepId,
  isSynced,
  syncProgress,
  alignmentPercent = 0,
  showGhost,
  showPid,
  onToggleGhost,
  onTogglePid,
}: TranslucentHandGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const template: StepTemplate = useMemo(() => getStepTemplate(stepId), [stepId]);

  const holdSeconds = Math.min(1.0, syncProgress).toFixed(1);
  const percentNumber = Math.min(100, Math.round(syncProgress * 100));

  return (
    <div className={`translucent-guide-card ${collapsed ? "translucent-guide-card--collapsed" : ""} ${isSynced ? "translucent-guide-card--synced" : ""}`}>
      {/* Header Bar */}
      <div className="guide-header">
        <div className="guide-title-box">
          <span className="guide-phase-pill">{template.phaseLabel}</span>
          <h3 className="guide-title">{template.name}</h3>
        </div>
        <button
          type="button"
          className="guide-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand guide" : "Collapse guide"}
          title={collapsed ? "Expand guide" : "Collapse guide"}
        >
          {collapsed ? "Show Target ▾" : "Minimize ▴"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Translucent Picture of the Hand Position for current step */}
          <div className="guide-visual-container">
            <div
              className="guide-svg-wrapper"
              dangerouslySetInnerHTML={{ __html: template.svgIllustration }}
            />
            <div className="guide-alignment-chip">
              <span className={`chip-dot ${isSynced ? "chip-dot--green" : alignmentPercent > 60 ? "chip-dot--yellow" : "chip-dot--red"}`} />
              <span>Pose Fit: {alignmentPercent}%</span>
            </div>
          </div>

          <p className="guide-instruction">{template.instruction}</p>

          {/* 1-Second Sync Hold Meter */}
          <div className="sync-meter-section">
            <div className="sync-meter-label-row">
              <span className="sync-label">
                {isSynced
                  ? percentNumber >= 100
                    ? "✓ POSITION SYNCED!"
                    : "HOLD TO SYNC POSITION"
                  : "ALIGN HAND WITH GHOST GUIDE"}
              </span>
              <span className="sync-timer">{isSynced ? `${holdSeconds}s / 1.0s` : "0.0s / 1.0s"}</span>
            </div>

            <div className="sync-track">
              <div
                className={`sync-fill ${isSynced ? "sync-fill--active" : ""}`}
                style={{ width: `${percentNumber}%` }}
              />
            </div>
          </div>

          {/* HUD Overlay Toggles */}
          <div className="guide-controls-row">
            <button
              type="button"
              className={`guide-toggle-pill ${showGhost ? "active" : ""}`}
              onClick={onToggleGhost}
            >
              Ghost Hand: {showGhost ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              className={`guide-toggle-pill ${showPid ? "active" : ""}`}
              onClick={onTogglePid}
            >
              PID Lines: {showPid ? "ON" : "OFF"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
