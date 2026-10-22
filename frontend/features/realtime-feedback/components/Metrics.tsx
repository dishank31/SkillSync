"use client";

import React from "react";
import type { MetricStatus } from "../../../shared/lib/types";

export interface MetricItemProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  target?: { min?: number; max?: number };
  deviation?: number | null;
  status?: MetricStatus;
}

export function MetricCard({
  label,
  value,
  unit,
  target,
  deviation,
  status = "unavailable",
}: MetricItemProps) {
  const isAvailable = value !== null && value !== undefined;

  let badgeClass = "badge-unavailable";
  let badgeLabel = "Unavailable";

  if (isAvailable) {
    if (status === "within_range") {
      badgeClass = "badge-within";
      badgeLabel = "Within Range";
    } else if (status === "outside_range") {
      badgeClass = "badge-outside";
      badgeLabel = deviation !== null && deviation !== undefined && deviation !== 0
        ? `${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}${unit} dev`
        : "Outside Range";
    }
  }

  const formatTarget = () => {
    if (!target) return "—";
    if (target.min !== undefined && target.max !== undefined) {
      return `${target.min}${unit} – ${target.max}${unit}`;
    }
    if (target.max !== undefined) {
      return `≤ ${target.max}${unit}`;
    }
    if (target.min !== undefined) {
      return `≥ ${target.min}${unit}`;
    }
    return "—";
  };

  return (
    <div className={`metric-box metric-box--${isAvailable ? status : "unavailable"}`}>
      <div className="metric-box-header">
        <span className="metric-box-title">{label}</span>
        <span className={`metric-box-badge ${badgeClass}`}>{badgeLabel}</span>
      </div>

      <div className="metric-box-body">
        <span className="metric-box-value">
          {isAvailable ? `${value.toFixed(1)}${unit}` : "—"}
        </span>
        <div className="metric-box-meta">
          <span className="target-label">Target: {formatTarget()}</span>
          {isAvailable && deviation !== null && deviation !== undefined && Math.abs(deviation) > 0.05 && (
            <span className="deviation-label">
              Dev: {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}{unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface MetricsProps {
  angles?: Record<string, number | null>;
  distances?: Record<string, number | null>;
  targets?: Record<string, { min?: number; max?: number }>;
  deviations?: Record<string, number | null>;
  statuses?: Record<string, MetricStatus>;
}

export default function Metrics({
  angles = {},
  distances = {},
  targets = {},
  deviations = {},
  statuses = {},
}: MetricsProps) {
  const mcpVal = angles.index_mcp_angle ?? angles.mcp_joint;
  const pipVal = angles.index_pip_angle ?? angles.pip_joint;
  const dipVal = angles.index_dip_angle;
  const wristIdxVal = angles.wrist_index_angle;
  const pinchVal = distances.thumb_index_distance ?? distances.thumb_index_over_palm;

  return (
    <div className="metrics-container" aria-label="Live Technique Measurements">
      <div className="metrics-header">
        <h3>Technique Measurements</h3>
        <span className="metrics-caption">Visual hand technique only (webcam-measured)</span>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="Index MCP Angle"
          value={mcpVal}
          unit="°"
          target={targets.index_mcp_angle ?? targets.mcp_joint}
          deviation={deviations.index_mcp_angle ?? deviations.mcp_joint}
          status={statuses.index_mcp_angle ?? statuses.mcp_joint ?? (mcpVal != null ? "within_range" : "unavailable")}
        />

        <MetricCard
          label="Index PIP Angle"
          value={pipVal}
          unit="°"
          target={targets.index_pip_angle ?? targets.pip_joint}
          deviation={deviations.index_pip_angle ?? deviations.pip_joint}
          status={statuses.index_pip_angle ?? statuses.pip_joint ?? (pipVal != null ? "within_range" : "unavailable")}
        />

        <MetricCard
          label="Tool Approach Angle"
          value={wristIdxVal}
          unit="°"
          target={targets.wrist_index_angle}
          deviation={deviations.wrist_index_angle}
          status={statuses.wrist_index_angle ?? (wristIdxVal != null ? "within_range" : "unavailable")}
        />

        <MetricCard
          label="Index DIP Angle"
          value={dipVal}
          unit="°"
          target={targets.index_dip_angle}
          deviation={deviations.index_dip_angle}
          status={statuses.index_dip_angle ?? (dipVal != null ? "within_range" : "unavailable")}
        />

        <MetricCard
          label="Thumb-Index Pinch"
          value={pinchVal}
          unit="x"
          target={targets.thumb_index_distance ?? targets.thumb_index_over_palm}
          deviation={deviations.thumb_index_distance ?? deviations.thumb_index_over_palm}
          status={statuses.thumb_index_distance ?? statuses.thumb_index_over_palm ?? (pinchVal != null ? "within_range" : "unavailable")}
        />
      </div>
    </div>
  );
}
