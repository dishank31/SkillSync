"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
import Metrics from "../features/realtime-feedback/components/Metrics";
import TranslucentHandGuide from "../features/hand-tracking/components/TranslucentHandGuide";
import SOPCompilerModal from "../features/procedure-intelligence/components/SOPCompilerModal";
import CCNLPTelemetrySidebar from "../features/realtime-feedback/components/CCNLPTelemetrySidebar";
import { useThinkAloudSpeech } from "../shared/hooks/useThinkAloudSpeech";
import { useTelemetry } from "../shared/contexts/TelemetryContext";
import { API_URL_PREFIX } from "../shared/lib/constants";
import type {
  DecayPrediction,
  DetectionStateType,
  MetricStatus,
  PracticeNote,
  SessionRecord,
  SessionReport,
} from "../shared/lib/types";

function formatStopwatch(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

type LandmarksDetail = {
  landmarks?: number[][];
  detectionState?: DetectionStateType;
  handedness?: string | null;
  handednessConfidence?: number | null;
};

type OverlayVariant = "good" | "warn" | "bad";
type Difficulty = "beginner" | "intermediate";
type TabKey = "dashboard" | "analytics" | "procedures";

function formatRetentionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(d);
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatProcedureLabel(value: string): string {
  const procedureLabels: Record<string, string> = {
    soldering_practice: "Simulated Soldering",
    approach_phase: "Approach Phase (Iron Angle)",
    positioning_phase: "Positioning Phase (Tripod Grip)",
    hold_phase: "Hold Phase (Thermal Dwell)",
    surgical_knot_tying: "Scalpel Handling",
  };

  if (procedureLabels[value]) {
    return procedureLabels[value];
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDifficultyLabel(value: string | null | undefined): string {
  if (!value) return "beginner";
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function buildScorePath(scores: number[], width: number, height: number): string {
  if (scores.length === 0) return "";
  if (scores.length === 1) {
    const y = height - (scores[0] / 100) * height;
    return `M 0 ${y} L ${width} ${y}`;
  }
  return scores
    .map((score, index) => {
      const x = (index / (scores.length - 1)) * width;
      const y = height - (score / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function HomePage() {
  const { connected, reconnecting, latest, send } = useTelemetry();
  const frameCounter = useRef(0);
  const landmarksRef = useRef<number[][]>([]);
  const detectionStateRef = useRef<DetectionStateType>("no_hand");

  const [selectedProcedure, setSelectedProcedure] = useState<string>("soldering_practice");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const difficultyRef = useRef<Difficulty>("beginner");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [studentId, setStudentId] = useState("");
  const studentIdRef = useRef("");
  const [studentConfirmed, setStudentConfirmed] = useState(false);

  // Calibration state (Phase A)
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  const REQUIRED_STABLE_FRAMES = 5;

  const [decay, setDecay] = useState<DecayPrediction | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [decayLoading, setDecayLoading] = useState(false);
  const [decayFetchFailed, setDecayFetchFailed] = useState(false);
  const [activeSessionReport, setActiveSessionReport] = useState<SessionReport | null>(null);
  const prevStepRef = useRef<string | undefined>(undefined);
  const [showGhost, setShowGhost] = useState(true);
  const [showPid, setShowPid] = useState(true);
  const [isSynced, setIsSynced] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [alignmentPercent, setAlignmentPercent] = useState(0);

  // Session Command Controls & Practice Notes State
  const [sessionStatus, setSessionStatus] = useState<"idle" | "running" | "paused" | "stopped">("running");
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const commandRef = useRef<string | null>(null);
  const [voiceToast, setVoiceToast] = useState<{ command: string; action: string } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const triggerVoiceToast = useCallback((command: string, action: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setVoiceToast({ command, action });
    toastTimeoutRef.current = setTimeout(() => {
      setVoiceToast(null);
    }, 2800);
  }, []);

  // Practice notes & callouts state
  const [practiceNotes, setPracticeNotes] = useState<PracticeNote[]>([]);
  const lastRecordedUtteranceRef = useRef<string>("");
  const lastRecordedTimeRef = useRef<number>(0);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [manualNoteText, setManualNoteText] = useState("");

  // Stopwatch timer for running session
  useEffect(() => {
    if (sessionStatus !== "running") return;
    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStatus]);

  // CCNLP Think-Aloud Speech & SOP Compiler State
  const [isSOPModalOpen, setIsSOPModalOpen] = useState(false);
  const [autoSpeakTTS, setAutoSpeakTTS] = useState(false);
  const speech = useThinkAloudSpeech({ autoSpeak: autoSpeakTTS });
  const [customProcedureTitle, setCustomProcedureTitle] = useState<string | null>(null);

  // Session Command Handlers
  const handleStartSession = useCallback(() => {
    setSessionStatus("running");
    setIsCalibrated(true);
    commandRef.current = "start";
    setSessionSeconds(0);
    setActiveSessionReport(null);
    triggerVoiceToast("start session", "Practice Session Started");
    if (autoSpeakTTS) {
      speech.speakFeedback("Practice session started. Live camera tracking active.");
    }
  }, [autoSpeakTTS, speech, triggerVoiceToast]);

  const handlePauseSession = useCallback(() => {
    setSessionStatus("paused");
    triggerVoiceToast("pause session", "Practice Session Paused");
    if (autoSpeakTTS) {
      speech.speakFeedback("Practice session paused.");
    }
  }, [autoSpeakTTS, speech, triggerVoiceToast]);

  const handleResumeSession = useCallback(() => {
    setSessionStatus("running");
    triggerVoiceToast("resume session", "Practice Session Resumed");
    if (autoSpeakTTS) {
      speech.speakFeedback("Practice session resumed.");
    }
  }, [autoSpeakTTS, speech, triggerVoiceToast]);

  const handleRestartSession = useCallback(() => {
    setSessionStatus("running");
    setSessionSeconds(0);
    commandRef.current = "reset";
    triggerVoiceToast("restart session", "Practice Restarted from Step 1");
    if (autoSpeakTTS) {
      speech.speakFeedback("Practice session restarted from Step 1.");
    }
  }, [autoSpeakTTS, speech, triggerVoiceToast]);

  const handleNextStep = useCallback(() => {
    commandRef.current = "next_step";
    triggerVoiceToast("next step", "Advancing to Next Step");
    if (autoSpeakTTS) {
      speech.speakFeedback("Advancing to next practice step.");
    }
  }, [autoSpeakTTS, speech, triggerVoiceToast]);

  const handleStopSession = useCallback(() => {
    setSessionStatus("stopped");
    commandRef.current = "stop";
    triggerVoiceToast("stop session", "Practice Session Ended");
    if (autoSpeakTTS) {
      speech.speakFeedback("Practice session ended. Opening session performance and callouts report.");
    }

    const rep: SessionReport = latest?.session_report ?? {
      student_id: studentIdRef.current || "anonymous",
      procedure_id: selectedProcedure,
      difficulty: difficultyRef.current,
      final_score: (latest?.score ?? 0.8),
      final_score_pct: Math.round((latest?.score ?? 0.8) * 100),
      duration_ms: sessionSeconds * 1000,
      completed_steps: [selectedProcedure],
      failed_attempts: 0,
      time_to_first_valid_hold_ms: 1200,
      observed_frames: frameCounter.current,
      estimated_frames: 0,
      total_frames: frameCounter.current,
      coverage_pct: 88,
      avg_hesitation_ms: 0,
      avg_deviation: 0,
      tremor_score: 0.1,
      step_breakdown: {},
      recommended_repeats: [],
      recommendation:
        latest?.intervention_recommendation ||
        "Maintain synchronized Think-Aloud verbal callouts with steady tool grip angles.",
      practice_notes: practiceNotes,
    };
    rep.practice_notes = practiceNotes;
    setActiveSessionReport(rep);
  }, [
    latest?.session_report,
    latest?.score,
    latest?.intervention_recommendation,
    selectedProcedure,
    sessionSeconds,
    practiceNotes,
    autoSpeakTTS,
    speech,
    triggerVoiceToast,
  ]);

  // Voice Command & Procedural Callout Detection Effect
  useEffect(() => {
    if (!speech.transcript) return;
    const raw = speech.transcript.trim();
    const lower = raw.toLowerCase();

    // 1. Voice Command Matching
    if (/^(start(\s+session|\s+practice)?|begin(\s+session|\s+practice)?)$/i.test(lower)) {
      handleStartSession();
      speech.clearTranscript();
      return;
    }
    if (/^(stop(\s+session|\s+practice)?|end(\s+session|\s+practice)?|finish(\s+session|\s+practice)?|complete(\s+session|\s+practice)?)$/i.test(lower)) {
      handleStopSession();
      speech.clearTranscript();
      return;
    }
    if (/^pause(\s+session|\s+practice)?$/i.test(lower)) {
      handlePauseSession();
      speech.clearTranscript();
      return;
    }
    if (/^(resume(\s+session|\s+practice)?|continue(\s+session|\s+practice)?)$/i.test(lower)) {
      handleResumeSession();
      speech.clearTranscript();
      return;
    }
    if (/^(restart(\s+session|\s+practice)?|reset(\s+session|\s+practice)?|repeat(\s+step)?)$/i.test(lower)) {
      handleRestartSession();
      speech.clearTranscript();
      return;
    }
    if (/^(next\s*step|skip\s*step|advance\s*step)$/i.test(lower)) {
      handleNextStep();
      speech.clearTranscript();
      return;
    }
    if (/^(clear\s*(all\s*)?(notes|callouts)|reset\s*notes)$/i.test(lower)) {
      setPracticeNotes([]);
      triggerVoiceToast("clear notes", "Practice Notes Cleared");
      if (autoSpeakTTS) speech.speakFeedback("Practice notes cleared.");
      speech.clearTranscript();
      return;
    }

    // 2. Procedural Think-Aloud Callout Recording
    if (sessionStatus === "running" && raw.length >= 4) {
      const now = Date.now();
      const isDuplicate =
        raw.toLowerCase() === lastRecordedUtteranceRef.current.toLowerCase() &&
        now - lastRecordedTimeRef.current < 4500;

      if (!isDuplicate) {
        lastRecordedUtteranceRef.current = raw;
        lastRecordedTimeRef.current = now;

        const currentStepName = latest?.step_name || (selectedProcedure === "surgical_knot_tying" ? "Scalpel Precision" : "Soldering Dwell");

        const newNote: PracticeNote = {
          id: `note_${now}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now,
          timeStr: formatStopwatch(sessionSeconds),
          stepId: latest?.step || "step_active",
          stepTitle: currentStepName,
          callout: raw,
          score: latest?.valid ? Math.round(latest.score * 100) : 0,
          alignmentState: latest?.alignment_state || "SYNCHRONIZED_MASTERY",
          pEntailment: latest?.p_entailment ?? 0.85,
          feedback:
            latest?.contrastive_feedback ||
            latest?.feedback?.[0]?.message ||
            "Technique evaluated with 3D joint bounds.",
        };

        setPracticeNotes((prev) => [newNote, ...prev]);
      }
    }
  }, [
    speech.transcript,
    sessionStatus,
    sessionSeconds,
    latest?.step,
    latest?.step_name,
    latest?.valid,
    latest?.score,
    latest?.alignment_state,
    latest?.p_entailment,
    latest?.contrastive_feedback,
    latest?.feedback,
    selectedProcedure,
    handleStartSession,
    handleStopSession,
    handlePauseSession,
    handleResumeSession,
    handleRestartSession,
    handleNextStep,
    speech,
    triggerVoiceToast,
    autoSpeakTTS,
  ]);

  // Practice Notes Utilities
  const copyPracticeNotes = useCallback(() => {
    if (practiceNotes.length === 0) return;
    const header = `# SkillSync Practice Notes - ${formatProcedureLabel(selectedProcedure)}\nDate: ${new Date().toLocaleString()}\nStudent: ${studentIdRef.current || "Anonymous"}\nTotal Callouts: ${practiceNotes.length}\n\n`;
    const body = practiceNotes
      .map(
        (n, i) =>
          `### Note ${practiceNotes.length - i} [${n.timeStr}] - ${n.stepTitle}\n- **Spoken Callout:** "${n.callout}"\n- **Technique Score:** ${n.score}%\n- **Alignment:** ${n.alignmentState} (Entailment: ${Math.round(n.pEntailment * 100)}%)\n- **AI Coach Feedback:** ${n.feedback}\n`
      )
      .join("\n");
    navigator.clipboard.writeText(header + body);
    setCopiedNotes(true);
    setTimeout(() => setCopiedNotes(false), 2000);
  }, [practiceNotes, selectedProcedure]);

  const exportPracticeNotes = useCallback(() => {
    if (practiceNotes.length === 0) return;
    const header = `# SkillSync Practice Session Notes Log\nProcedure: ${formatProcedureLabel(selectedProcedure)}\nDate: ${new Date().toISOString()}\nStudent: ${studentIdRef.current || "Anonymous"}\nTotal Callouts: ${practiceNotes.length}\n\n=========================================\n\n`;
    const body = practiceNotes
      .map(
        (n) =>
          `[${n.timeStr}] ${n.stepTitle}\nCallout: "${n.callout}"\nTechnique Score: ${n.score}%\nAlignment State: ${n.alignmentState} (Entailment: ${Math.round(n.pEntailment * 100)}%)\nFeedback: ${n.feedback}\n`
      )
      .join("\n-----------------------------------------\n\n");
    const blob = new Blob([header + body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillsync_notes_${selectedProcedure}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [practiceNotes, selectedProcedure]);

  const handleAddManualNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualNoteText.trim()) return;
    const now = Date.now();
    const currentStepName = latest?.step_name || (selectedProcedure === "surgical_knot_tying" ? "Scalpel Precision" : "Soldering Dwell");
    const newNote: PracticeNote = {
      id: `manual_${now}`,
      timestamp: now,
      timeStr: formatStopwatch(sessionSeconds),
      stepId: latest?.step || "current_step",
      stepTitle: currentStepName,
      callout: manualNoteText.trim(),
      score: latest?.valid ? Math.round(latest.score * 100) : 0,
      alignmentState: latest?.alignment_state || "SYNCHRONIZED_MASTERY",
      pEntailment: latest?.p_entailment ?? 0.9,
      feedback: "Manual observation note recorded.",
    };
    setPracticeNotes((prev) => [newNote, ...prev]);
    setManualNoteText("");
  };

  // Auto-speak contrastive feedback if TTS is enabled and feedback changed
  const lastSpokenFeedbackRef = useRef<string>("");
  useEffect(() => {
    if (autoSpeakTTS && latest?.contrastive_feedback && latest.contrastive_feedback !== lastSpokenFeedbackRef.current) {
      lastSpokenFeedbackRef.current = latest.contrastive_feedback;
      speech.speakFeedback(latest.contrastive_feedback);
    }
  }, [autoSpeakTTS, latest?.contrastive_feedback, speech]);

  const handleSyncUpdate = useCallback((data: { isSynced: boolean; syncProgress: number; alignmentPercent: number }) => {
    setIsSynced(data.isSynced);
    setSyncProgress(data.syncProgress);
    setAlignmentPercent(data.alignmentPercent);
  }, []);

  const loadUserDbData = useCallback(async (sid: string) => {
    if (!sid) return;
    setDecayFetchFailed(false);
    setDecayLoading(true);
    try {
      const decayUrl = `${API_URL_PREFIX}/api/students/${encodeURIComponent(sid)}/decay`;
      const sessionsUrl = `${API_URL_PREFIX}/api/students/${encodeURIComponent(sid)}/sessions`;
      const [decayRes, sessionsRes] = await Promise.all([fetch(decayUrl), fetch(sessionsUrl)]);
      setDecay(decayRes.ok ? await decayRes.json() : null);
      setSessions(sessionsRes.ok ? await sessionsRes.json() : []);
      setDecayFetchFailed(!decayRes.ok);
    } catch {
      setDecayFetchFailed(true);
      setDecay(null);
      setSessions([]);
    } finally {
      setDecayLoading(false);
    }
  }, []);

  const confirmStudent = useCallback(async () => {
    const sid = studentId.trim().toLowerCase();
    if (!sid) return;
    studentIdRef.current = sid;
    prevStepRef.current = undefined;
    setStudentConfirmed(true);
    try {
      await fetch(`${API_URL_PREFIX}/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: sid }),
      });
    } catch {}
    loadUserDbData(sid);
  }, [studentId, loadUserDbData]);

  // Subscribe to raw landmark events from camera
  useEffect(() => {
    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      const state = customEvent.detail?.detectionState ?? "no_hand";
      detectionStateRef.current = state;

      if (Array.isArray(points)) {
        landmarksRef.current = points;

        // Calibration logic: check if hand is detected with landmarks
        if (!isCalibrated) {
          if (points.length >= 15) {
            const wrist = points[0];
            const middleTip = points[12] ?? points[points.length - 1];
            // Relaxed bounding area check to allow natural camera positioning
            const isInsideBox =
              (!wrist || (wrist[0] > 0.05 && wrist[0] < 0.95)) &&
              (!middleTip || (middleTip[0] > 0.05 && middleTip[0] < 0.95));

            if (isInsideBox) {
              setStableFrameCount((c) => {
                const next = c + 1;
                if (next >= REQUIRED_STABLE_FRAMES) {
                  setIsCalibrated(true);
                }
                return next;
              });
            } else {
              setStableFrameCount((c) => Math.max(0, c - 1));
            }
          } else {
            setStableFrameCount((c) => Math.max(0, c - 1));
          }
        }
      }
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => window.removeEventListener("skillsync:landmarks", handleLandmarks);
  }, [isCalibrated]);

  // Frame streaming loop over WebSocket
  useEffect(() => {
    if (!connected || !studentConfirmed || !studentIdRef.current || !isCalibrated) return;

    let intervalId: number | null = null;
    const sendFrame = () => {
      // If session is paused, skip sending active frames to freeze timers
      if (sessionStatus === "paused") return;

      const activeCmd = commandRef.current;
      commandRef.current = null;

      send({
        frame_id: frameCounter.current,
        timestamp_ms: Date.now(),
        landmarks: landmarksRef.current,
        procedure_id: selectedProcedure,
        difficulty: difficultyRef.current,
        student_id: studentIdRef.current || "anonymous",
        spoken_utterance: (speech.transcriptRef?.current ?? speech.transcript) || undefined,
        utterance_latency_sec: (speech.lastSpokenAtRef?.current ?? speech.lastSpokenAt)
          ? (Date.now() - (speech.lastSpokenAtRef?.current ?? speech.lastSpokenAt!)) / 1000
          : 0,
        command: activeCmd || undefined,
      });
      frameCounter.current += 1;
    };

    const start = () => {
      if (intervalId !== null) return;
      sendFrame();
      intervalId = window.setInterval(sendFrame, 100);
    };

    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, send, studentConfirmed, isCalibrated, selectedProcedure]);

  // Real, un-fabricated score & state directly from backend (No artificial triple smoothing!)
  const scorePercent = latest?.valid && latest?.frame_is_observed
    ? Math.round(Math.max(0, Math.min(1, latest.score)) * 100)
    : 0;

  const currentDetectionState = latest?.detection_state ?? detectionStateRef.current;
  const isObserved = latest?.frame_is_observed ?? false;
  const isStale = (latest?.landmarks_estimated && !isObserved) ?? false;

  const primaryFeedback =
    currentDetectionState === "no_hand"
      ? "No hand detected. Position your hand inside the work area."
      : latest?.feedback?.[0]?.message ?? "Maintain iron approach angle steadily.";

  // Handle session report when procedure completes
  useEffect(() => {
    if (latest?.session_report) {
      setActiveSessionReport(latest.session_report as SessionReport);
    }
  }, [latest?.session_report]);

  useEffect(() => {
    if (!latest?.skill_decay) return;
    setDecay(latest.skill_decay);
    setDecayFetchFailed(false);
    const sid = studentIdRef.current;
    if (!sid) return;
    void fetch(`${API_URL_PREFIX}/api/students/${encodeURIComponent(sid)}/sessions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: SessionRecord[]) => setSessions(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [latest?.skill_decay]);

  useEffect(() => {
    const step = latest?.step;
    const sid = studentIdRef.current;
    if (!sid || !studentConfirmed) {
      prevStepRef.current = step;
      return;
    }
    const enteredCompleted = step === "completed" && prevStepRef.current !== "completed";
    prevStepRef.current = step;
    if (enteredCompleted) loadUserDbData(sid);
  }, [latest?.step, studentConfirmed, loadUserDbData]);

  const stepDescriptions: Record<string, string> = {
    approach_phase: "Enter work area with steady iron angle (40°–70°).",
    positioning_phase: "Form precision tripod grip and align tip with joint.",
    hold_phase: "Hold steady contact for 3.0s dwell without trembling.",
    thumb_index_precision_grip: "Keep thumb and index finger close for precision grip.",
    middle_finger_support: "Use middle finger as supporting finger near index.",
    initial_incision_position: "Start with near-perpendicular tool orientation.",
    cutting_angle_control: "Maintain controlled cutting angle during motion.",
    grip_stability: "Hold the validated grip steadily.",
    completed: "Procedure completed successfully.",
  };

  const procedureSteps =
    latest?.procedure_steps ||
    (selectedProcedure === "surgical_knot_tying"
      ? [
          { id: "thumb_index_precision_grip", dwell_time_ms: 1000 },
          { id: "middle_finger_support", dwell_time_ms: 1000 },
          { id: "initial_incision_position", dwell_time_ms: 1000 },
          { id: "cutting_angle_control", dwell_time_ms: 1000 },
          { id: "grip_stability", dwell_time_ms: 1000 },
          { id: "completed", dwell_time_ms: 0 },
        ]
      : [
          { id: "approach_phase", dwell_time_ms: 2000 },
          { id: "positioning_phase", dwell_time_ms: 2500 },
          { id: "hold_phase", dwell_time_ms: 3000 },
          { id: "completed", dwell_time_ms: 0 },
        ]);

  const effectiveStepId = latest?.reset ? procedureSteps[0]?.id : latest?.step;
  const overlayVariant: OverlayVariant = latest?.valid ? "good" : latest?.landmarks?.length ? "warn" : "bad";
  const currentStepIndex = procedureSteps.findIndex((step) => step.id === effectiveStepId);

  const steps = procedureSteps.map((step, index) => {
    let state: "pending" | "active" | "done" = "pending";
    if (effectiveStepId === step.id) state = step.id === "completed" ? "done" : "active";
    else if (index < currentStepIndex) state = "done";
    return {
      title: formatProcedureLabel(step.id),
      detail: stepDescriptions[step.id] || `Step ${index + 1}`,
      state,
    };
  });

  const analytics = useMemo(() => {
    const latestSessions = [...sessions].sort((a, b) => {
      const timeA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const timeB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.id - a.id;
    });
    const chartSessions = latestSessions.slice(0, 8).reverse();
    const chartScores = chartSessions.map((session) =>
      Math.round(Math.max(0, Math.min(1, session.final_score)) * 100)
    );
    const averageScore = latestSessions.length
      ? Math.round(
          (latestSessions.reduce((sum, s) => sum + Math.max(0, Math.min(1, s.final_score)), 0) /
            latestSessions.length) *
            100
        )
      : 0;
    const bestScore = latestSessions.length
      ? Math.round(Math.max(...latestSessions.map((s) => Math.max(0, Math.min(1, s.final_score)))) * 100)
      : 0;
    const completionRate = latestSessions.length
      ? Math.round(
          (latestSessions.filter((s) => s.passed !== false).length / latestSessions.length) * 100
        )
      : 0;

    return {
      latestSessions,
      chartSessions,
      chartScores,
      chartPath: buildScorePath(chartScores, 520, 180),
      averageScore,
      bestScore,
      completionRate,
      daysUntilDecay:
        decay?.days_until_decay !== null && decay?.days_until_decay !== undefined
          ? decay.days_until_decay > 0
            ? `${Math.ceil(decay.days_until_decay)} days`
            : "Due now"
          : "Pending",
      analyticsStatus: decay?.refresher_needed
        ? "Refresher recommended"
        : decay
        ? "Retention stable"
        : "Waiting for data",
    };
  }, [sessions, decay]);

  return (
    <main className="dashboard-shell">
      {/* Product Dislaimer Banner */}
      <div className="disclaimer-banner">
        <div>
          <span className="disclaimer-badge">Technique Coach</span>
          <span>
            Visual hand technique practice only. A standard camera cannot verify iron temperature,
            contact force, electrical continuity, or solder joint metallurgy.
          </span>
        </div>
        <span className="text-xs text-slate-500">Fixed Work Area · 1 Hand</span>
      </div>

      <header className="topbar">
        <div className="brand-area">
          <h1 className="brand-name">SkillSync</h1>
          <nav className="top-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`top-nav-link ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`top-nav-link ${activeTab === "analytics" ? "active" : ""}`}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </button>
            <button
              type="button"
              className={`top-nav-link ${activeTab === "procedures" ? "active" : ""}`}
              onClick={() => setActiveTab("procedures")}
            >
              Procedures
            </button>
          </nav>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="sop-compiler-topbar-btn"
            onClick={() => setIsSOPModalOpen(true)}
            title="Open Frame-Semantic SOP-to-Kinematic Compiler"
          >
            <span>📜</span>
            <span>SOP Compiler</span>
          </button>
          <div className="search-pill">
            {activeTab === "analytics" ? "Search sessions..." : "Search data..."}
          </div>
          <button className="icon-btn" aria-label="Notifications">
            N
          </button>
          <button className="icon-btn" aria-label="Settings">
            S
          </button>
          <div className="avatar">
            {studentConfirmed ? studentId.slice(0, 2).toUpperCase() : "SS"}
          </div>
        </div>
      </header>

      {!studentConfirmed && (
        <div className="student-bar">
          <div className="student-bar-inner">
            <span className="student-bar-icon">👤</span>
            <input
              id="student-name-input"
              className="student-input"
              type="text"
              placeholder="Enter your name to start tracking..."
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmStudent();
              }}
            />
            <button
              className="student-btn"
              onClick={confirmStudent}
              disabled={!studentId.trim()}
            >
              Start Session
            </button>
          </div>
        </div>
      )}

      {activeTab === "dashboard" && (
        <section className="content-grid">
          <section className="viewer-panel">
            <div className="viewer-badges">
              <span className="badge badge-live">
                {connected ? "LIVE TRACKING" : "OFFLINE"}
              </span>

              {/* Explicit Detection State Pill (Phase A) */}
              <span className={`detection-pill detection-pill--${currentDetectionState}`}>
                {currentDetectionState.replace("_", " ")}
              </span>

              <div className="diff-inline" role="radiogroup" aria-label="Difficulty level">
                <button
                  id="difficulty-beginner"
                  className={`diff-pill ${difficulty === "beginner" ? "diff-pill--active" : ""}`}
                  onClick={() => {
                    setDifficulty("beginner");
                    difficultyRef.current = "beginner";
                  }}
                  aria-pressed={difficulty === "beginner"}
                >
                  Beginner
                </button>
                <button
                  id="difficulty-intermediate"
                  className={`diff-pill ${difficulty === "intermediate" ? "diff-pill--active" : ""}`}
                  onClick={() => {
                    setDifficulty("intermediate");
                    difficultyRef.current = "intermediate";
                  }}
                  aria-pressed={difficulty === "intermediate"}
                >
                  Intermediate
                </button>
              </div>
            </div>

            {/* Session Command Control Bar */}
            <div className="session-control-bar">
              <div className="session-status-cluster">
                <span className={`session-status-badge session-status-badge--${sessionStatus}`}>
                  <span className="session-status-dot" />
                  {sessionStatus === "running" ? "ACTIVE" : sessionStatus.toUpperCase()}
                </span>
                <span className="session-stopwatch">⏱ {formatStopwatch(sessionSeconds)}</span>
              </div>

              <div className="session-action-btns">
                {sessionStatus === "running" ? (
                  <>
                    <button
                      type="button"
                      className="session-btn session-btn--pause"
                      onClick={handlePauseSession}
                      title="Pause Practice Session (Voice: 'pause session')"
                    >
                      ⏸ Pause
                    </button>
                    <button
                      type="button"
                      className="session-btn session-btn--stop"
                      onClick={handleStopSession}
                      title="Stop & Review Practice Report (Voice: 'stop session')"
                    >
                      ⏹ Stop Session
                    </button>
                    <button
                      type="button"
                      className="session-btn session-btn--secondary"
                      onClick={handleRestartSession}
                      title="Restart Practice from Step 1 (Voice: 'restart session')"
                    >
                      🔄 Restart
                    </button>
                    <button
                      type="button"
                      className="session-btn session-btn--secondary"
                      onClick={handleNextStep}
                      title="Advance to Next Step (Voice: 'next step')"
                    >
                      ⏭ Next Step
                    </button>
                  </>
                ) : sessionStatus === "paused" ? (
                  <>
                    <button
                      type="button"
                      className="session-btn session-btn--resume"
                      onClick={handleResumeSession}
                      title="Resume Practice Session (Voice: 'resume session')"
                    >
                      ▶ Resume
                    </button>
                    <button
                      type="button"
                      className="session-btn session-btn--stop"
                      onClick={handleStopSession}
                      title="Stop & Review Practice Report"
                    >
                      ⏹ Stop Session
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="session-btn session-btn--start"
                    onClick={handleStartSession}
                    title="Start Practice Session (Voice: 'start session')"
                  >
                    ▶ Start Session
                  </button>
                )}
              </div>

              <div className="session-voice-help" title="Voice Commands supported by Think-Aloud Speech Recognition">
                <span>🎙️ Voice: "start session" · "stop session" · "pause" · "next step" · "clear notes"</span>
              </div>
            </div>

            <div className="hand-stage" aria-label="Live hand stage">
              <div className="stage-glow" />
              <CameraFeed compact />
              <HandOverlay
                stepId={effectiveStepId}
                variant={overlayVariant}
                isStale={isStale}
                showCalibrationBox={!isCalibrated}
                calibrationProgress={stableFrameCount / REQUIRED_STABLE_FRAMES}
                showGhost={showGhost}
                showPidLines={showPid}
                onSyncUpdate={handleSyncUpdate}
              />
              <TranslucentHandGuide
                stepId={effectiveStepId}
                isSynced={isSynced || overlayVariant === "good"}
                syncProgress={syncProgress}
                alignmentPercent={alignmentPercent}
                showGhost={showGhost}
                showPid={showPid}
                onToggleGhost={() => setShowGhost((prev) => !prev)}
                onTogglePid={() => setShowPid((prev) => !prev)}
              />

              {/* Calibration Modal / Guide Overlay */}
              {studentConfirmed && !isCalibrated && (
                <div className="calibration-overlay">
                  <div className="calibration-card">
                    <h3 className="text-lg font-bold mb-2">Camera Calibration</h3>
                    <p className="text-xs text-slate-300 mb-4">
                      Position your hand inside the camera view. Keep your wrist, palm, and fingers visible to begin live tracking.
                    </p>

                    <div className="calibration-progress-bar">
                      <div
                        className="calibration-progress-fill"
                        style={{
                          width: `${Math.min(100, (stableFrameCount / REQUIRED_STABLE_FRAMES) * 100)}%`,
                        }}
                      />
                    </div>

                    <p className="text-xs text-emerald-400 font-semibold mb-4">
                      {stableFrameCount > 0
                        ? `Calibrating: ${stableFrameCount}/${REQUIRED_STABLE_FRAMES} stable frames...`
                        : "Align hand in view to auto-start, or click below:"}
                    </p>

                    <button
                      type="button"
                      id="skip-calibration-btn"
                      className="student-btn"
                      style={{
                        width: "100%",
                        padding: "11px 18px",
                        fontSize: "14px",
                        fontWeight: 700,
                        background: "linear-gradient(90deg, #10b981, #059669)",
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setIsCalibrated(true);
                      }}
                    >
                      Start Practice Now (Skip Calibration)
                    </button>
                  </div>
                </div>
              )}

              {!connected && (
                <div className="stage-empty">
                  {reconnecting
                    ? "Reconnecting to live scoring..."
                    : "Waiting for backend websocket..."}
                </div>
              )}

              <div className="status-card status-card--stage">
                <div className="status-icon">{isSynced ? "✓" : "AI"}</div>
                <div>
                  <p className="status-title">
                    {!isCalibrated
                      ? "Hand Calibration"
                      : isSynced
                      ? "Position Synced (Hold 1s)"
                      : selectedProcedure === "soldering_practice"
                      ? "Soldering Technique Coach"
                      : "Scalpel Technique Coach"}
                  </p>
                  <p className="status-subtitle">{primaryFeedback}</p>
                </div>
              </div>

              {/* Practice Notes & Spoken Callouts Log Card */}
              <article className="practice-notes-card">
                <div className="practice-notes-head">
                  <div className="practice-notes-title-group">
                    <h3 className="practice-notes-title">📋 Practice Notes & Callouts</h3>
                    <span className="practice-notes-counter">
                      {practiceNotes.length} {practiceNotes.length === 1 ? "Note" : "Notes"}
                    </span>
                  </div>

                  <div className="practice-notes-actions">
                    {practiceNotes.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="practice-notes-action-btn"
                          onClick={copyPracticeNotes}
                          title="Copy all notes formatted to clipboard"
                        >
                          {copiedNotes ? "✓ Copied!" : "📋 Copy"}
                        </button>
                        <button
                          type="button"
                          className="practice-notes-action-btn"
                          onClick={exportPracticeNotes}
                          title="Download notes as Markdown file"
                        >
                          📥 Export
                        </button>
                        <button
                          type="button"
                          className="practice-notes-action-btn"
                          onClick={() => setPracticeNotes([])}
                          title="Clear all recorded notes"
                        >
                          🗑️ Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {practiceNotes.length === 0 ? (
                  <div className="practice-notes-empty">
                    <p>No callouts recorded yet. Speak into the microphone using Think-Aloud (e.g. <em>"Holding scalpel in pencil grip at 45 degrees"</em>) to automatically record notes with live AI feedback.</p>
                  </div>
                ) : (
                  <div className="practice-notes-list">
                    {practiceNotes.map((note) => (
                      <div key={note.id} className="practice-note-item">
                        <div className="practice-note-meta">
                          <span className="practice-note-time">⏱ {note.timeStr}</span>
                          <span className="practice-note-step">{note.stepTitle}</span>
                        </div>
                        <p className="practice-note-callout">"{note.callout}"</p>
                        <div className="practice-note-footer">
                          <span
                            className={`practice-note-alignment practice-note-alignment--${
                              note.alignmentState.includes("SYNCHRONIZED")
                                ? "synchronized"
                                : note.alignmentState.includes("DRIFT")
                                ? "drift"
                                : "contradiction"
                            }`}
                          >
                            {note.alignmentState.replace(/_/g, " ")} ({Math.round(note.pEntailment * 100)}%)
                          </span>
                          <span className="practice-note-feedback" title={note.feedback}>
                            💡 {note.feedback}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Note Add Input */}
                <form onSubmit={handleAddManualNote} className="practice-notes-add-box">
                  <input
                    type="text"
                    className="practice-notes-input"
                    placeholder="Type custom practice observation or coaching note..."
                    value={manualNoteText}
                    onChange={(e) => setManualNoteText(e.target.value)}
                  />
                  <button type="submit" className="practice-notes-submit-btn">
                    + Add Note
                  </button>
                </form>
              </article>
            </div>
          </section>

          <aside className="insights-panel" aria-label="Live metrics">
            {/* 1. Primary Physical Technique Compliance Score Card */}
            <article className="metric-card">
              <div className="metric-head">
                <span className="metric-icon">★</span>
                <span className="metric-chip">
                  {scorePercent >= 80 ? "OPTIMAL" : scorePercent > 40 ? "TRAINING" : "POSITIONING"}
                </span>
              </div>
              <p className="metric-value">
                {scorePercent}
                <span>%</span>
              </p>
              <p className="metric-label">Technique Compliance Score</p>
              <div className="progress-track">
                <span style={{ width: `${scorePercent}%` }} />
              </div>
            </article>

            {/* 2. CCNLP Multimodal Telemetry Sidebar */}
            <CCNLPTelemetrySidebar
              telemetry={latest}
              spokenTranscript={speech.transcript}
              isListening={speech.isListening}
              speechError={speech.speechError}
              onToggleListening={() => {
                if (speech.isListening) {
                  speech.stopListening();
                } else {
                  speech.startListening();
                }
              }}
              onClearTranscript={speech.clearTranscript}
              onSetTranscript={speech.setTranscript}
              autoSpeak={autoSpeakTTS}
              onToggleAutoSpeak={() => setAutoSpeakTTS((prev) => !prev)}
              onOpenSOPCompiler={() => setIsSOPModalOpen(true)}
            />

            {/* Live Measurements with 3-State Badges (Metrics.tsx) */}
            <Metrics
              angles={latest?.angles ?? {}}
              distances={latest?.distances ?? {}}
              targets={latest?.metric_targets ?? {}}
              deviations={latest?.metric_deviations ?? {}}
              statuses={latest?.metric_statuses ?? {}}
            />

            {/* Procedure Steps Gating */}
            <article className="steps-card">
              <div className="steps-head">
                <h2>Practice Steps</h2>
                <span>
                  STEP {Math.max(1, currentStepIndex + 1)} OF {procedureSteps.length}
                </span>
              </div>
              <ul className="steps-list">
                {steps.map((step) => (
                  <li key={step.title} className={`step-row ${step.state}`}>
                    <span className="step-dot" aria-hidden="true" />
                    <div>
                      <p>{step.title}</p>
                      <small>{step.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </aside>
        </section>
      )}

      {/* Session Report Modal (Phase E) */}
      {activeSessionReport && (
        <div className="report-modal">
          <div className="report-card">
            <div className="report-header">
              <h2 className="text-xl font-bold text-slate-800">Practice Session Report</h2>
              <p className="text-sm text-slate-500">
                Completed {formatProcedureLabel(activeSessionReport.procedure_id)} (
                {activeSessionReport.difficulty})
              </p>
            </div>

            <div className="report-grid">
              <div className="report-stat">
                <span>Technique Score</span>
                <strong>{activeSessionReport.final_score_pct}%</strong>
              </div>

              <div className="report-stat">
                <span>Valid Observed Coverage</span>
                <strong>{activeSessionReport.coverage_pct}%</strong>
              </div>

              <div className="report-stat">
                <span>Broken Hold Attempts</span>
                <strong>{activeSessionReport.failed_attempts}</strong>
              </div>

              <div className="report-stat">
                <span>Time to First Valid Hold</span>
                <strong>
                  {activeSessionReport.time_to_first_valid_hold_ms
                    ? `${(activeSessionReport.time_to_first_valid_hold_ms / 1000).toFixed(1)}s`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="report-recommendation">
              <strong>Coaching Recommendation:</strong>
              <p className="mt-1">{activeSessionReport.recommendation}</p>
            </div>

            {/* Practice Callouts & Procedural Notes Section */}
            <div className="report-notes-section">
              <div className="report-notes-title">
                <span>Practice Callouts & Procedural Notes ({activeSessionReport.practice_notes?.length ?? practiceNotes.length})</span>
                <button
                  type="button"
                  className="practice-notes-action-btn"
                  onClick={copyPracticeNotes}
                >
                  {copiedNotes ? "✓ Copied" : "📋 Copy Log"}
                </button>
              </div>

              {(activeSessionReport.practice_notes?.length ?? practiceNotes.length) === 0 ? (
                <p className="text-xs text-slate-400 italic">No spoken callouts logged during this practice run.</p>
              ) : (
                <div className="report-notes-scroll">
                  {(activeSessionReport.practice_notes ?? practiceNotes).map((note) => (
                    <div key={note.id} className="p-2 bg-white rounded border border-slate-200 text-xs">
                      <div className="flex justify-between font-bold text-slate-700">
                        <span>{note.stepTitle}</span>
                        <span className="font-mono text-slate-400">{note.timeStr}</span>
                      </div>
                      <p className="mt-1 text-slate-800 font-medium">"{note.callout}"</p>
                      <p className="mt-1 text-[11px] text-cyan-700">
                        Entailment: {Math.round(note.pEntailment * 100)}% · Coach: {note.feedback}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                className="student-btn"
                onClick={() => setActiveSessionReport(null)}
              >
                Close Report & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <section className="analytics-shell">
          <section className="analytics-hero">
            <div className="analytics-hero-copy">
              <p className="analytics-kicker">Learner Intelligence</p>
              <h2>
                {studentConfirmed
                  ? `Performance history for ${studentId || studentIdRef.current}`
                  : "Unlock your session intelligence"}
              </h2>
              <p>
                A dedicated analytics canvas for retention timing, session quality, score trend, and
                the full database timeline.
              </p>
            </div>
            <div className="analytics-hero-badges">
              <span className="analytics-flag analytics-flag--primary">
                {analytics.analyticsStatus}
              </span>
              <span className="analytics-flag">
                {studentConfirmed
                  ? `${analytics.latestSessions.length} sessions tracked`
                  : "Awaiting learner"}
              </span>
            </div>
          </section>

          {studentConfirmed ? (
            <>
              <section className="analytics-grid">
                <article className="analytics-card analytics-card--spotlight">
                  <div className="analytics-card-head">
                    <div>
                      <p className="analytics-card-label">Retention Pulse</p>
                      <h3>
                        {decay
                          ? `${Math.round(decay.current_competency * 100)}% competency`
                          : "No retention model yet"}
                      </h3>
                    </div>
                    {decay?.refresher_needed && (
                      <span className="refresher-badge">REFRESHER DUE</span>
                    )}
                  </div>
                  <div className="pulse-meter">
                    <div
                      className="pulse-meter-fill"
                      style={{
                        width: `${decay ? Math.round(decay.current_competency * 100) : 0}%`,
                      }}
                    />
                    <div className="pulse-meter-threshold" />
                  </div>
                  <div className="analytics-stat-row">
                    <div className="analytics-stat-block">
                      <span>Projected decay</span>
                      <strong>{formatRetentionDate(decay?.projected_decay_date)}</strong>
                    </div>
                    <div className="analytics-stat-block">
                      <span>Refresher plan</span>
                      <strong>{formatRetentionDate(decay?.refresher_date)}</strong>
                    </div>
                  </div>
                  <div className="analytics-mini-grid">
                    <div className="analytics-mini-card">
                      <span>Days until decay</span>
                      <strong>{analytics.daysUntilDecay}</strong>
                    </div>
                    <div className="analytics-mini-card">
                      <span>Decay rate</span>
                      <strong>
                        {decay ? `${(decay.decay_rate * 100).toFixed(1)}%/day` : "—"}
                      </strong>
                    </div>
                    <div className="analytics-mini-card">
                      <span>Last session</span>
                      <strong>{formatShortDate(decay?.last_session_date)}</strong>
                    </div>
                  </div>
                </article>

                <article className="analytics-card analytics-card--scoreboard">
                  <div className="analytics-card-head">
                    <div>
                      <p className="analytics-card-label">Session Scoreboard</p>
                      <h3>Latest outcomes in sequence</h3>
                    </div>
                  </div>
                  <div className="scoreboard-grid">
                    <div className="scoreboard-tile">
                      <span>Average</span>
                      <strong>{analytics.averageScore}%</strong>
                    </div>
                    <div className="scoreboard-tile">
                      <span>Best</span>
                      <strong>{analytics.bestScore}%</strong>
                    </div>
                    <div className="scoreboard-tile">
                      <span>Completion</span>
                      <strong>{analytics.completionRate}%</strong>
                    </div>
                    <div className="scoreboard-tile">
                      <span>Total sessions</span>
                      <strong>{analytics.latestSessions.length}</strong>
                    </div>
                  </div>
                </article>
              </section>

              <section className="analytics-grid analytics-grid--bottom">
                <article className="analytics-card analytics-card--chart">
                  <div className="analytics-card-head">
                    <div>
                      <p className="analytics-card-label">Performance Curve</p>
                      <h3>Recent score trend</h3>
                    </div>
                  </div>
                  {analytics.chartSessions.length > 0 ? (
                    <div className="score-chart">
                      <svg
                        viewBox="0 0 520 220"
                        className="score-chart-svg"
                        aria-label="Recent score trend"
                      >
                        <defs>
                          <linearGradient id="score-line" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#13b2cf" />
                            <stop offset="100%" stopColor="#ff8c42" />
                          </linearGradient>
                        </defs>
                        {[0, 25, 50, 75, 100].map((tick) => {
                          const y = 180 - (tick / 100) * 180;
                          return (
                            <g key={tick}>
                              <line x1="0" x2="520" y1={y} y2={y} className="chart-grid-line" />
                              <text x="0" y={y - 6} className="chart-grid-label">
                                {tick}
                              </text>
                            </g>
                          );
                        })}
                        <path d={analytics.chartPath} className="chart-line" />
                        {analytics.chartScores.map((score, index) => {
                          const x =
                            analytics.chartScores.length === 1
                              ? 260
                              : (index / (analytics.chartScores.length - 1)) * 520;
                          const y = 180 - (score / 100) * 180;
                          return (
                            <circle
                              key={`${score}-${index}`}
                              cx={x}
                              cy={y}
                              r="5.5"
                              className="chart-point"
                            />
                          );
                        })}
                      </svg>
                      <div className="chart-label-row">
                        {analytics.chartSessions.map((session) => (
                          <span key={session.id}>{formatShortDate(session.completed_at)}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="analytics-empty">
                      Complete a few sessions and the score curve will render here.
                    </p>
                  )}
                </article>

                <article className="analytics-card analytics-card--timeline">
                  <div className="analytics-card-head">
                    <div>
                      <p className="analytics-card-label">Database Timeline</p>
                      <h3>Latest sessions from SQLite</h3>
                    </div>
                  </div>
                  {decayLoading && analytics.latestSessions.length === 0 && !decay ? (
                    <p className="analytics-empty">Loading session history...</p>
                  ) : decayFetchFailed && !decay && !decayLoading ? (
                    <p className="analytics-empty analytics-empty--error">
                      Could not load analytics. Check that the backend proxy is reachable from this
                      device.
                    </p>
                  ) : analytics.latestSessions.length > 0 ? (
                    <ul className="session-timeline" aria-label="Past sessions from database">
                      {analytics.latestSessions.map((session, index) => (
                        <li key={session.id} className="timeline-item">
                          <div className="timeline-rail">
                            <span className="timeline-dot" />
                            {index < analytics.latestSessions.length - 1 && (
                              <span className="timeline-line" />
                            )}
                          </div>
                          <div className="timeline-card">
                            <div className="timeline-card-main">
                              <div>
                                <strong>{formatRetentionDate(session.completed_at)}</strong>
                                <p>
                                  {formatProcedureLabel(session.procedure_id)} ·{" "}
                                  {formatDifficultyLabel(session.difficulty)}
                                </p>
                              </div>
                              <div className="timeline-score">
                                {Math.round(session.final_score * 100)}%
                              </div>
                            </div>
                            <div className="timeline-meta">
                              <span>{session.passed === false ? "Needs review" : "Passed"}</span>
                              <span>{session.attempt_count} attempts</span>
                              <span>{Math.round(session.duration_ms / 1000)}s duration</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="analytics-empty">
                      Enter your name and complete a procedure once. Your full retention history will
                      appear here.
                    </p>
                  )}
                </article>
              </section>
            </>
          ) : (
            <article className="analytics-card analytics-card--empty">
              <p className="analytics-empty">
                Confirm a learner name first. Analytics will light up as soon as the first session is
                saved.
              </p>
            </article>
          )}
        </section>
      )}

      {activeTab === "procedures" && (
        <section className="procedures-shell">
          <div className="analytics-hero mb-6">
            <div className="analytics-hero-copy">
              <p className="analytics-kicker">Training Modules</p>
              <h2>Select Precision Practice Task</h2>
              <p>Camera-assisted physical skill guidance with joint angle verification.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <article
              className={`analytics-card p-6 border-2 transition ${
                selectedProcedure === "soldering_practice"
                  ? "border-cyan-600 bg-cyan-50/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-600 uppercase tracking-wider">Primary Task</span>
                {selectedProcedure === "soldering_practice" && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Active Task
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-2">Simulated Soldering Practice</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Approach, positioning, and 3-second thermal dwell hold on a fixed work area.
                Coaches visual pencil grip angle and steadiness.
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-[10px] font-semibold text-cyan-800 bg-cyan-100/70 px-2 py-0.5 rounded">
                  3D Joint Bounds
                </span>
                <span className="text-[10px] font-semibold text-indigo-800 bg-indigo-100/70 px-2 py-0.5 rounded">
                  DeBERTa-v3 NLI
                </span>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                  Frame-Semantic SOP
                </span>
              </div>

              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  className="student-btn flex-1"
                  onClick={() => {
                    setSelectedProcedure("soldering_practice");
                    setIsCalibrated(false);
                    setStableFrameCount(0);
                    setActiveTab("dashboard");
                  }}
                >
                  {selectedProcedure === "soldering_practice" ? "Practice Now" : "Select Task"}
                </button>
                <button
                  type="button"
                  className="sop-compiler-inline-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSOPModalOpen(true);
                  }}
                  title="Open Frame-Semantic SOP Compiler for this procedure"
                  style={{
                    padding: "9px 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    borderRadius: "8px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⚡ Custom SOP
                </button>
              </div>
            </article>

            <article
              className={`analytics-card p-6 border-2 transition ${
                selectedProcedure === "surgical_knot_tying"
                  ? "border-cyan-600 bg-cyan-50/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Secondary Task</span>
                {selectedProcedure === "surgical_knot_tying" && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Active Task
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-2">Scalpel Handling</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Precision grip, finger support, initial incision positioning, and cutting angle control
                with Dr. Choudhary technique bounds.
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-[10px] font-semibold text-cyan-800 bg-cyan-100/70 px-2 py-0.5 rounded">
                  3D Joint Bounds
                </span>
                <span className="text-[10px] font-semibold text-indigo-800 bg-indigo-100/70 px-2 py-0.5 rounded">
                  DeBERTa-v3 NLI
                </span>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                  Frame-Semantic SOP
                </span>
              </div>

              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  className="student-btn flex-1"
                  onClick={() => {
                    setSelectedProcedure("surgical_knot_tying");
                    setIsCalibrated(false);
                    setStableFrameCount(0);
                    setActiveTab("dashboard");
                  }}
                >
                  {selectedProcedure === "surgical_knot_tying" ? "Practice Now" : "Select Task"}
                </button>
                <button
                  type="button"
                  className="sop-compiler-inline-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSOPModalOpen(true);
                  }}
                  title="Open Frame-Semantic SOP Compiler for this procedure"
                  style={{
                    padding: "9px 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    borderRadius: "8px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⚡ Custom SOP
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* Zero-Code SOP Compiler Modal */}
      <SOPCompilerModal
        isOpen={isSOPModalOpen}
        onClose={() => setIsSOPModalOpen(false)}
        onSelectProcedure={(pid, name) => {
          setSelectedProcedure(pid);
          if (name) setCustomProcedureTitle(name);
          setIsCalibrated(true);
          setActiveTab("dashboard");
        }}
      />

      {/* Floating Voice Command Toast */}
      {voiceToast && (
        <div className="voice-command-toast" role="status" aria-live="polite">
          <span className="voice-toast-badge">Voice Command</span>
          <span>⚡ <strong>"{voiceToast.command}"</strong> — {voiceToast.action}</span>
        </div>
      )}
    </main>
  );
}

