"use client";

import { useEffect, useRef } from "react";
import type { DetectionStateType } from "../../../shared/lib/types";

type HandOverlayProps = {
  landmarks?: number[][];
  variant?: "good" | "warn" | "bad";
  isStale?: boolean;
  showCalibrationBox?: boolean;
  calibrationProgress?: number; // 0 to 1
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

function getPalette(variant: "good" | "warn" | "bad", isStale: boolean) {
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
      stroke: "rgba(34, 197, 94, 0.9)", // green-500
      shadow: "rgba(16, 185, 129, 0.95)",
      wrist: "rgba(220, 252, 231, 0.95)",
      point: "rgba(74, 222, 128, 0.95)",
    };
  }
  if (variant === "warn") {
    return {
      stroke: "rgba(234, 179, 8, 0.9)", // yellow-500
      shadow: "rgba(250, 204, 21, 0.95)",
      wrist: "rgba(254, 249, 195, 0.95)",
      point: "rgba(253, 224, 71, 0.95)",
    };
  }
  return {
    stroke: "rgba(239, 68, 68, 0.92)", // red-500
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
  // Guide box occupying central 50% of the viewport
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

function drawHand(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: number[][],
  variant: "good" | "warn" | "bad",
  isStale: boolean,
) {
  const { width, height } = canvas;

  if (landmarks.length < 21) {
    return;
  }

  const palette = getPalette(variant, isStale);
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = palette.stroke;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = isStale ? 0 : 6;
  if (isStale) {
    ctx.setLineDash([4, 4]);
  }

  HAND_CONNECTIONS.forEach(([from, to]) => {
    const start = landmarks[from];
    const end = landmarks[to];
    if (!start || !end) return;

    ctx.beginPath();
    ctx.moveTo(start[0] * width, start[1] * height);
    ctx.lineTo(end[0] * width, end[1] * height);
    ctx.stroke();
  });

  ctx.setLineDash([]);
  landmarks.forEach((point, index) => {
    const x = point[0] * width;
    const y = point[1] * height;
    ctx.beginPath();
    ctx.fillStyle = index === 0 ? palette.wrist : palette.point;
    ctx.arc(x, y, index === 0 ? 5.5 : 3.8, 0, Math.PI * 2);
    ctx.fill();
  });

  if (isStale) {
    ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("STALE POSE (TRACKING LOST)", landmarks[0][0] * width - 60, landmarks[0][1] * height + 20);
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
}: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const variantRef = useRef<"good" | "warn" | "bad">("warn");
  const isStaleRef = useRef(false);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  useEffect(() => {
    isStaleRef.current = isStale;
  }, [isStale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (showCalibrationBox) {
      drawCalibrationBox(ctx, canvas.width, canvas.height, calibrationProgress);
    }

    if (Array.isArray(landmarks) && landmarks.length === 21) {
      drawHand(ctx, canvas, landmarks, variantRef.current, isStaleRef.current);
      return;
    }

    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (showCalibrationBox) {
        drawCalibrationBox(ctx, canvas.width, canvas.height, calibrationProgress);
      }
      if (Array.isArray(points) && points.length === 21) {
        drawHand(ctx, canvas, points, variantRef.current, isStaleRef.current);
      }
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => {
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
    };
  }, [landmarks, showCalibrationBox, calibrationProgress]);

  return (
    <canvas ref={canvasRef} width={1000} height={620} className="stage-canvas" />
  );
}
