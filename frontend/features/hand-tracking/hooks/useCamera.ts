"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectionStateType } from "../../../shared/lib/types";

type FacingMode = "user" | "environment";

type CameraRequest = {
  deviceId: string | null;
  facingMode: FacingMode;
};

export type CameraDiagnostics = {
  cameraOpen: boolean;
  framesArriving: boolean;
  modelLoaded: boolean;
  detectorReady: boolean;
  detectionState: DetectionStateType;
  initError: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function getCameraStreamWithRetry(request: CameraRequest, maxAttempts = 4): Promise<MediaStream> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const primaryVideoConstraints = request.deviceId
        ? { deviceId: { exact: request.deviceId } }
        : { facingMode: { ideal: request.facingMode } };

      try {
        return await navigator.mediaDevices.getUserMedia({
          video: primaryVideoConstraints,
          audio: false,
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    } catch (err) {
      lastError = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotReadableError" || name === "AbortError") {
        await sleep(250 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Camera unavailable");
}

async function listVideoInputs() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [request, setRequest] = useState<CameraRequest>({
    deviceId: null,
    facingMode: "user",
  });
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isLikelyMobile, setIsLikelyMobile] = useState(false);

  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics>({
    cameraOpen: false,
    framesArriving: false,
    modelLoaded: false,
    detectorReady: false,
    detectionState: "no_hand",
    initError: null,
  });

  const refreshDevices = useCallback(async (preferredCameraId?: string | null) => {
    try {
      const cameras = await listVideoInputs();
      setAvailableCameras(cameras);
      if (preferredCameraId) {
        setActiveCameraId(preferredCameraId);
        return;
      }
      if (cameras.length > 0) {
        setActiveCameraId((current) => current ?? cameras[0].deviceId);
      }
    } catch {
      setAvailableCameras([]);
    }
  }, []);

  const switchCamera = useCallback(() => {
    setIsSwitchingCamera(true);
    setRequest((current) => {
      if (availableCameras.length > 1) {
        const currentIndex = availableCameras.findIndex((camera) => camera.deviceId === activeCameraId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableCameras.length : 0;
        return {
          deviceId: availableCameras[nextIndex]?.deviceId ?? null,
          facingMode: current.facingMode,
        };
      }

      return {
        deviceId: null,
        facingMode: current.facingMode === "user" ? "environment" : "user",
      };
    });
  }, [activeCameraId, availableCameras]);

  useEffect(() => {
    setIsLikelyMobile(
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1,
    );
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;
    let visibilityHandler: (() => void) | null = null;
    let deviceChangeHandler: (() => void) | null = null;
    let stopped = false;
    let attachFrameId: number | null = null;
    let detectorClose: (() => void) | null = null;

    let lastTimestampMs = 0;
    let wasLost = false;

    const startLandmarkLoop = async (videoEl: HTMLVideoElement) => {
      try {
        setDiagnostics((prev) => ({ ...prev, modelLoaded: false, initError: null }));
        const vision = await import("@mediapipe/tasks-vision");
        if (stopped) return;

        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );
        if (stopped) return;

        setDiagnostics((prev) => ({ ...prev, modelLoaded: true }));

        const detector = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
        if (stopped) {
          detector.close();
          return;
        }

        setDiagnostics((prev) => ({ ...prev, detectorReady: true, initError: null }));

        const tick = () => {
          if (stopped) {
            detector.close();
            return;
          }

          if (videoEl.readyState >= 2) {
            setDiagnostics((prev) => (prev.framesArriving ? prev : { ...prev, framesArriving: true }));

            // MediaPipe Tasks VIDEO mode requires strictly increasing monotonic timestamps
            const now = performance.now();
            const ts = Math.max(now, lastTimestampMs + 1);
            lastTimestampMs = ts;

            const result = detector.detectForVideo(videoEl, ts);
            const handList = result.landmarks?.[0];
            const landmarks = handList?.map((point) => [point.x, point.y, point.z]) ?? [];

            let state: DetectionStateType = "no_hand";
            if (landmarks.length === 21) {
              if (wasLost) {
                state = "tracking_recovered";
                wasLost = false;
              } else {
                state = "hand_detected";
              }
            } else {
              wasLost = true;
              state = "no_hand";
            }

            setDiagnostics((prev) => ({ ...prev, detectionState: state }));

            window.dispatchEvent(
              new CustomEvent("skillsync:landmarks", {
                detail: {
                  landmarks,
                  detectionState: state,
                  handedness: result.handedness?.[0]?.[0]?.categoryName ?? null,
                  handednessConfidence: result.handedness?.[0]?.[0]?.score ?? null,
                },
              }),
            );
          }
        };

        tick();
        intervalId = window.setInterval(tick, 33);

        visibilityHandler = () => {
          if (!stopped && document.visibilityState === "visible") {
            tick();
          }
        };
        document.addEventListener("visibilitychange", visibilityHandler);
        detectorClose = () => {
          try {
            detector.close();
          } catch {}
        };
      } catch (error) {
        console.error("Hand landmarker init failed:", error);
        const errMsg = error instanceof Error ? error.message : "MediaPipe HandLandmarker init failed";
        setDiagnostics((prev) => ({
          ...prev,
          detectorReady: false,
          initError: errMsg,
        }));
        window.dispatchEvent(
          new CustomEvent("skillsync:landmarks", {
            detail: { landmarks: [], detectionState: "no_hand" },
          }),
        );
      }
    };

    const setup = async () => {
      try {
        setStreamReady(false);
        setDiagnostics((prev) => ({ ...prev, cameraOpen: false, framesArriving: false }));
        stream = await getCameraStreamWithRetry(request);

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          return;
        }

        const [videoTrack] = stream.getVideoTracks();
        const settings = videoTrack?.getSettings();
        const detectedCameraId = settings?.deviceId ?? request.deviceId;
        await refreshDevices(detectedCameraId);

        deviceChangeHandler = () => {
          void refreshDevices(detectedCameraId ?? null);
        };
        navigator.mediaDevices.addEventListener("devicechange", deviceChangeHandler);

        const attachStream = async () => {
          if (stopped) return;

          const videoEl = videoRef.current;
          if (!videoEl) {
            attachFrameId = window.requestAnimationFrame(() => {
              void attachStream();
            });
            return;
          }

          videoEl.srcObject = null;
          videoEl.srcObject = stream;

          const onLoadedData = () => {
            if (!stopped) {
              setStreamReady(true);
              setIsSwitchingCamera(false);
              setDiagnostics((prev) => ({ ...prev, cameraOpen: true }));
            }
          };

          videoEl.addEventListener("loadeddata", onLoadedData, { once: true });
          try {
            await videoEl.play();
          } catch (playErr) {
            console.warn("Video play() interrupted or blocked:", playErr);
          }
          if (!stopped) {
            startLandmarkLoop(videoEl);
          }
        };

        await attachStream();
      } catch (error) {
        console.error("Camera access failed:", error);
        setStreamReady(false);
        setIsSwitchingCamera(false);
        setDiagnostics((prev) => ({
          ...prev,
          cameraOpen: false,
          initError: error instanceof Error ? error.message : "Camera access denied",
        }));
      }
    };

    void setup();

    return () => {
      stopped = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      if (deviceChangeHandler) navigator.mediaDevices.removeEventListener("devicechange", deviceChangeHandler);
      if (attachFrameId !== null) window.cancelAnimationFrame(attachFrameId);
      detectorClose?.();
      detectorClose = null;
      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };
  }, [refreshDevices, request]);

  return {
    videoRef,
    streamReady,
    canSwitchCamera: availableCameras.length > 1 || isLikelyMobile,
    switchCamera,
    isSwitchingCamera,
    diagnostics,
  };
}
