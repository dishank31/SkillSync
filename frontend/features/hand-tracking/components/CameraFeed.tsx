"use client";

import { useEffect, useState } from "react";
import { useCamera } from "../hooks/useCamera";

type CameraFeedProps = {
  compact?: boolean;
};

export default function CameraFeed({ compact = false }: CameraFeedProps) {
  const { videoRef, streamReady, canSwitchCamera, switchCamera, isSwitchingCamera } = useCamera();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const stage = videoRef.current?.closest(".hand-stage");
      setIsFullscreen(Boolean(stage && document.fullscreenElement === stage));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [videoRef]);

  const toggleFullscreen = async () => {
    const stage = videoRef.current?.closest(".hand-stage") as HTMLElement | null;
    if (!stage) return;

    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
      return;
    }

    await stage.requestFullscreen();
  };

  if (compact) {
    return (
      <>
        <video ref={videoRef} autoPlay playsInline muted className="stage-video" />
        <div className="stage-controls">
          {canSwitchCamera && (
            <button
              type="button"
              className="stage-control-btn"
              onClick={switchCamera}
              disabled={isSwitchingCamera}
            >
              {isSwitchingCamera ? "Switching..." : "Switch Camera"}
            </button>
          )}
          <button type="button" className="stage-control-btn" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
        {!streamReady && <div className="stage-empty">Allow camera access to start live tracking.</div>}
      </>
    );
  }

  return (
    <div className="card">
      <h2>Camera Feed</h2>
      <video ref={videoRef} autoPlay playsInline muted className="video" />
      <p>{streamReady ? "Camera connected" : "Waiting for camera permissions..."}</p>
    </div>
  );
}
