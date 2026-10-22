"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FacingMode = "user" | "environment";

type CameraRequest = {
  deviceId: string | null;
  facingMode: FacingMode;
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

    const startLandmarkLoop = async (videoEl: HTMLVideoElement) => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        if (stopped) {
          return;
        }
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );
        if (stopped) {
          return;
        }

        const detector = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        if (stopped) {
          detector.close();
          return;
        }

        const tick = () => {
          if (stopped) {
            detector.close();
            return;
          }

          if (videoEl.readyState >= 2) {
            const result = detector.detectForVideo(videoEl, performance.now());
            const landmarks = result.landmarks?.[0]?.map((point) => [point.x, point.y, point.z]) ?? [];

            window.dispatchEvent(
              new CustomEvent("skillsync:landmarks", {
                detail: { landmarks },
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
          } catch {
            // ignore
          }
        };
      } catch (error) {
        console.error("Hand landmarker init failed:", error);
        window.dispatchEvent(
          new CustomEvent("skillsync:landmarks", {
            detail: { landmarks: [] },
          }),
        );
      }
    };

    const setup = async () => {
      try {
        setStreamReady(false);
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
          if (stopped) {
            return;
          }

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
      }
    };

    void setup();

    return () => {
      stopped = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (deviceChangeHandler) {
        navigator.mediaDevices.removeEventListener("devicechange", deviceChangeHandler);
      }
      if (attachFrameId !== null) {
        window.cancelAnimationFrame(attachFrameId);
      }
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
  };
}
