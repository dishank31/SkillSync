"use client";

import { useEffect, useRef } from "react";
import type { DetectionStateType } from "../../../shared/lib/types";
import { getStepTemplate, adaptTemplateToHand } from "../processing/stepTemplates";
import { PidHandGuidance, PidEvaluation } from "../processing/pidController";

export type HandOverlayProps = {
  landmarks?: number[][];
  variant?: "good" | "warn" | "bad";
  isStale?: boolean;
  showCalibrationBox?: boolean;
  calibrationProgress?: number; // 0 to 1
  stepId?: string;
  showGhost?: boolean;
  showPidLines?: boolean;
  onSyncUpdate?: (data: { isSynced: boolean; syncProgress: number; alignmentPercent: number }) => void;
};

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

function getPalette(variant: "good" | "warn" | "bad", isStale: boolean = false) {
  if (isStale) {
    return {
      stroke: "rgba(148, 163, 184, 0.45)", // muted slate
      shadow: "rgba(100, 116, 139, 0.2)",
      wrist: "rgba(203, 213, 225, 0.5)",
      point: "rgba(148, 163, 184, 0.5)",
    };
  }
  if (variant === "good") {
    return {
      stroke: "rgba(34, 197, 94, 0.95)",
      shadow: "rgba(16, 185, 129, 0.95)",
      wrist: "rgba(220, 252, 231, 0.95)",
      point: "rgba(74, 222, 128, 0.95)",
    };
  }
  if (variant === "warn") {
    return {
      stroke: "rgba(234, 179, 8, 0.92)",
      shadow: "rgba(250, 204, 21, 0.95)",
      wrist: "rgba(254, 249, 195, 0.95)",
      point: "rgba(253, 224, 71, 0.95)",
    };
  }
  return {
    stroke: "rgba(239, 68, 68, 0.92)",
    shadow: "rgba(248, 113, 113, 0.95)",
    wrist: "rgba(254, 226, 226, 0.95)",
    point: "rgba(252, 165, 165, 0.95)",
  };
}

function drawCalibrationBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  // Guide box occupying central 55% of the viewport
  const boxW = width * 0.55;
  const boxH = height * 0.70;
  const boxX = (width - boxW) / 2;
  const boxY = (height - boxH) / 2;

  ctx.save();
  ctx.strokeStyle = progress >= 1.0 ? "rgba(34, 197, 94, 0.9)" : "rgba(56, 189, 248, 0.7)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Corner brackets
  ctx.setLineDash([]);
  const bracketLen = 28;
  ctx.lineWidth = 4;
  ctx.strokeStyle = progress >= 1.0 ? "#22c55e" : "#0284c7";

  // Top-left
  ctx.beginPath();
  ctx.moveTo(boxX, boxY + bracketLen);
  ctx.lineTo(boxX, boxY);
  ctx.lineTo(boxX + bracketLen, boxY);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(boxX + boxW - bracketLen, boxY);
  ctx.lineTo(boxX + boxW, boxY);
  ctx.lineTo(boxX + boxW, boxY + bracketLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(boxX, boxY + boxH - bracketLen);
  ctx.lineTo(boxX, boxY + boxH);
  ctx.lineTo(boxX + bracketLen, boxY + boxH);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(boxX + boxW - bracketLen, boxY + boxH);
  ctx.lineTo(boxX + boxW, boxY + boxH);
  ctx.lineTo(boxX + boxW, boxY + boxH - bracketLen);
  ctx.stroke();

  // Calibration progress bar at bottom of box
  if (progress > 0) {
    const barW = boxW * 0.8;
    const barX = boxX + (boxW - barW) / 2;
    const barY = boxY + boxH - 24;
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
    ctx.fillRect(barX, barY, barW, 10);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(barX, barY, barW * Math.min(1.0, progress), 10);
  }

  ctx.restore();
}

type LandmarksDetail = {
  landmarks?: number[][];
  detectionState?: DetectionStateType;
};

export default function HandOverlay({
  landmarks,
  variant = "warn",
  isStale = false,
  showCalibrationBox = false,
  calibrationProgress = 0,
  stepId = "thumb_index_precision_grip",
  showGhost = true,
  showPidLines = true,
  onSyncUpdate,
}: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const variantRef = useRef<"good" | "warn" | "bad">(variant);
  const isStaleRef = useRef<boolean>(isStale);
  const showCalibrationBoxRef = useRef<boolean>(showCalibrationBox);
  const calibrationProgressRef = useRef<number>(calibrationProgress);
  const stepIdRef = useRef<string>(stepId);
  const showGhostRef = useRef<boolean>(showGhost);
  const showPidLinesRef = useRef<boolean>(showPidLines);

  const pidControllerRef = useRef<PidHandGuidance>(new PidHandGuidance(0.72, 0.06, 0.24));
  const syncHoldStartRef = useRef<number | null>(null);
  const syncProgressRef = useRef<number>(0);
  const pulseAnimRef = useRef<number>(0);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  useEffect(() => {
    isStaleRef.current = isStale;
  }, [isStale]);

  useEffect(() => {
    showCalibrationBoxRef.current = showCalibrationBox;
  }, [showCalibrationBox]);

  useEffect(() => {
    calibrationProgressRef.current = calibrationProgress;
  }, [calibrationProgress]);

  useEffect(() => {
    stepIdRef.current = stepId;
    pidControllerRef.current.reset();
    syncHoldStartRef.current = null;
    syncProgressRef.current = 0;
  }, [stepId]);

  useEffect(() => {
    showGhostRef.current = showGhost;
  }, [showGhost]);

  useEffect(() => {
    showPidLinesRef.current = showPidLines;
  }, [showPidLines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const draw = (userPoints?: number[][]) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Calibration box if calibrating
      if (showCalibrationBoxRef.current) {
        drawCalibrationBox(ctx, width, height, calibrationProgressRef.current);
      }

      pulseAnimRef.current = (pulseAnimRef.current + 0.04) % (Math.PI * 2);
      const pulseFactor = 0.5 + 0.5 * Math.sin(pulseAnimRef.current);

      const template = getStepTemplate(stepIdRef.current);
      const adaptedTargetLandmarks = adaptTemplateToHand(template.landmarks, userPoints);

      let pidEval: PidEvaluation | null = null;
      let isSyncedNow = false;

      if (userPoints && userPoints.length >= 21) {
        pidEval = pidControllerRef.current.evaluate(
          userPoints,
          adaptedTargetLandmarks,
          template.keyJoints,
          performance.now()
        );
        isSyncedNow = pidEval.isSynced || variantRef.current === "good";
      }

      // Handle 1-second hold to sync
      const now = performance.now();
      if (isSyncedNow) {
        if (syncHoldStartRef.current === null) {
          syncHoldStartRef.current = now;
        }
        const elapsed = now - syncHoldStartRef.current;
        syncProgressRef.current = Math.min(1.0, elapsed / 1000.0);
      } else {
        syncHoldStartRef.current = null;
        syncProgressRef.current = Math.max(0, syncProgressRef.current - 0.08);
      }

      if (onSyncUpdate && pidEval) {
        onSyncUpdate({
          isSynced: isSyncedNow,
          syncProgress: syncProgressRef.current,
          alignmentPercent: pidEval.alignmentPercent,
        });
      }

      // ─────────────────────────────────────────────────────────────────
      // LAYER 1: Translucent Ghost Target Hand (Position Guide)
      // ─────────────────────────────────────────────────────────────────
      if (showGhostRef.current && adaptedTargetLandmarks.length >= 21) {
        ctx.save();
        const ghostSynced = isSyncedNow;
        const ghostStroke = ghostSynced
          ? "rgba(34, 197, 94, 0.45)"
          : "rgba(56, 189, 248, 0.38)";
        const ghostShadow = ghostSynced
          ? "rgba(16, 185, 129, 0.5)"
          : "rgba(56, 189, 248, 0.4)";
        const ghostJointFill = ghostSynced
          ? "rgba(74, 222, 128, 0.55)"
          : "rgba(125, 211, 252, 0.55)";

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = ghostStroke;
        ctx.shadowColor = ghostShadow;
        ctx.shadowBlur = 10;
        ctx.setLineDash([6, 4]);

        HAND_CONNECTIONS.forEach(([from, to]) => {
          const start = adaptedTargetLandmarks[from];
          const end = adaptedTargetLandmarks[to];
          if (!start || !end) return;

          ctx.beginPath();
          ctx.moveTo(start[0] * width, start[1] * height);
          ctx.lineTo(end[0] * width, end[1] * height);
          ctx.stroke();
        });

        ctx.setLineDash([]); // Reset dash for joints

        // Draw translucent ghost joints & key target rings
        adaptedTargetLandmarks.forEach((point, index) => {
          const x = point[0] * width;
          const y = point[1] * height;
          const isKey = template.keyJoints.includes(index);

          // Outer target halo
          ctx.beginPath();
          ctx.strokeStyle = isKey
            ? ghostSynced
              ? "rgba(34, 197, 94, 0.8)"
              : "rgba(56, 189, 248, 0.7)"
            : "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = isKey ? 1.8 : 1.2;
          ctx.arc(x, y, isKey ? 8 + pulseFactor * 2 : 5, 0, Math.PI * 2);
          ctx.stroke();

          // Inner solid core
          ctx.beginPath();
          ctx.fillStyle = ghostJointFill;
          ctx.arc(x, y, isKey ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
      }

      // ─────────────────────────────────────────────────────────────────
      // LAYER 2: PID Guidance Lines (Draw line of points to target)
      // ─────────────────────────────────────────────────────────────────
      if (showPidLinesRef.current && pidEval && pidEval.jointGuides.length > 0) {
        ctx.save();

        pidEval.jointGuides.forEach((guide) => {
          const { userPoint, targetPoint, pidPoint, status, isKeyJoint } = guide;

          const ux = userPoint[0] * width;
          const uy = userPoint[1] * height;
          const tx = targetPoint[0] * width;
          const ty = targetPoint[1] * height;
          const px = pidPoint[0] * width;
          const py = pidPoint[1] * height;

          const distPx = Math.hypot(tx - ux, ty - uy);
          if (distPx < 3) return; // Already perfectly synced at this joint

          let strokeColor = "rgba(239, 68, 68, 0.75)"; // bad = red
          let pulseColor = "rgba(254, 202, 202, 0.9)";
          if (status === "good") {
            strokeColor = "rgba(34, 197, 94, 0.85)"; // good = green
            pulseColor = "rgba(187, 247, 208, 0.9)";
          } else if (status === "warn") {
            strokeColor = "rgba(234, 179, 8, 0.85)"; // warn = yellow
            pulseColor = "rgba(254, 240, 138, 0.9)";
          }

          // Main guidance vector line
          ctx.beginPath();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isKeyJoint ? 2.5 : 1.6;
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = 6;
          ctx.moveTo(ux, uy);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          // Small directional pulse dot traveling along the line to target
          const progress = (pulseAnimRef.current / (Math.PI * 2));
          const dotX = ux + (tx - ux) * progress;
          const dotY = uy + (ty - uy) * progress;

          ctx.beginPath();
          ctx.fillStyle = pulseColor;
          ctx.arc(dotX, dotY, isKeyJoint ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();

          // Subtle PID trajectory marker
          if (isKeyJoint && Math.hypot(px - tx, py - ty) > 4) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.moveTo(ux, uy);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        ctx.restore();
      }

      // ─────────────────────────────────────────────────────────────────
      // LAYER 3: User's Hand Skeleton & Joints
      // ─────────────────────────────────────────────────────────────────
      if (userPoints && userPoints.length >= 21) {
        ctx.save();
        const palette = getPalette(variantRef.current, isStaleRef.current);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = palette.stroke;
        ctx.shadowColor = palette.shadow;
        ctx.shadowBlur = isStaleRef.current ? 0 : 8;

        if (isStaleRef.current) {
          ctx.setLineDash([4, 4]);
        }

        HAND_CONNECTIONS.forEach(([from, to]) => {
          const start = userPoints[from];
          const end = userPoints[to];
          if (!start || !end) return;

          ctx.beginPath();
          ctx.moveTo(start[0] * width, start[1] * height);
          ctx.lineTo(end[0] * width, end[1] * height);
          ctx.stroke();
        });

        ctx.setLineDash([]);
        userPoints.forEach((point, index) => {
          const x = point[0] * width;
          const y = point[1] * height;
          ctx.beginPath();
          ctx.fillStyle = index === 0 ? palette.wrist : palette.point;
          ctx.arc(x, y, index === 0 ? 5.5 : 3.8, 0, Math.PI * 2);
          ctx.fill();
        });

        if (isStaleRef.current) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("STALE POSE (TRACKING LOST)", userPoints[0][0] * width - 60, userPoints[0][1] * height + 20);
        }

        ctx.restore();
      }

      // ─────────────────────────────────────────────────────────────────
      // LAYER 4: 1-Second Hold Radial Sync Progress Meter
      // ─────────────────────────────────────────────────────────────────
      if (userPoints && userPoints.length >= 21 && syncProgressRef.current > 0.02) {
        ctx.save();
        const wrist = userPoints[0];
        const cx = wrist[0] * width;
        const cy = wrist[1] * height - 55; // Floats slightly above the wrist

        const radius = 28;
        const progress = syncProgressRef.current;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + progress * Math.PI * 2;

        // Background track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 5;
        ctx.stroke();

        // Glowing fill arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = progress >= 1.0 ? "#22c55e" : "#34d399";
        ctx.lineWidth = 5;
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 12;
        ctx.lineCap = "round";
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 7, 0, Math.PI * 2);
        ctx.fillStyle = progress >= 1.0 ? "rgba(34, 197, 94, 0.45)" : "rgba(16, 185, 129, 0.22)";
        ctx.fill();

        // Expansion ripple when 1.0s complete
        if (progress >= 0.98) {
          const rippleRadius = radius + 8 + pulseFactor * 10;
          ctx.beginPath();
          ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.8 - pulseFactor * 0.4})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.restore();
      }
    };

    let latestLandmarks: number[][] | null = Array.isArray(landmarks) && landmarks.length >= 21 ? landmarks : null;
    let animFrame = 0;

    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      if (Array.isArray(points)) {
        latestLandmarks = points;
      }
    };

    const renderLoop = () => {
      const pts = latestLandmarks || (Array.isArray(landmarks) && landmarks.length >= 21 ? landmarks : undefined);
      draw(pts);
      animFrame = requestAnimationFrame(renderLoop);
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    animFrame = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
      cancelAnimationFrame(animFrame);
    };
  }, [landmarks, onSyncUpdate]);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={620}
      className="stage-canvas"
      aria-label="Hand tracking and PID guidance overlay"
    />
  );
}
