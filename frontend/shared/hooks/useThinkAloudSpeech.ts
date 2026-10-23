"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useThinkAloudSpeech(options: { autoSpeak?: boolean } = {}) {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscriptState] = useState("");
  const [lastSpokenAt, setLastSpokenAt] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const restartTimeoutRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const lastSpokenAtRef = useRef<number | null>(null);
  const ttsEnabledRef = useRef(options.autoSpeak ?? false);

  useEffect(() => {
    ttsEnabledRef.current = options.autoSpeak ?? false;
  }, [options.autoSpeak]);

  // Keep refs in sync with state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    lastSpokenAtRef.current = lastSpokenAt;
  }, [lastSpokenAt]);

  // Check browser support on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscriptState("");
    transcriptRef.current = "";
    setLastSpokenAt(null);
    lastSpokenAtRef.current = null;
  }, []);

  const setTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    setTranscriptState(trimmed);
    transcriptRef.current = trimmed;
    const now = Date.now();
    setLastSpokenAt(now);
    lastSpokenAtRef.current = now;
  }, []);

  // Helper to spawn and start a fresh SpeechRecognition instance
  const spawnRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setSpeechError(
        "Web Speech API is not supported in this browser. Please use Chrome or Edge, or use quick callouts below."
      );
      return null;
    }

    // Abort previous instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    let recognition: any = null;
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        let finalStr = "";
        let interimStr = "";

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalStr += res[0].transcript + " ";
          } else {
            interimStr += res[0].transcript;
          }
        }

        const activeText = (finalStr + interimStr).trim();
        if (activeText) {
          setTranscriptState(activeText);
          transcriptRef.current = activeText;
          const now = Date.now();
          setLastSpokenAt(now);
          lastSpokenAtRef.current = now;
          setSpeechError(null);
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event.error;
        console.warn("SpeechRecognition event error:", errType);

        if (errType === "no-speech") {
          // Normal silence interval, keep listening flag alive
          return;
        }

        if (errType === "not-allowed" || errType === "service-not-allowed") {
          setSpeechError(
            "Microphone permission blocked. Click the lock or camera/mic icon in your address bar to allow access."
          );
          isListeningRef.current = false;
          setIsListening(false);
        } else if (errType === "audio-capture") {
          setSpeechError("No microphone hardware detected on your device.");
          isListeningRef.current = false;
          setIsListening(false);
        } else if (errType === "network") {
          // Network issue connecting to speech cloud
          console.warn("Speech network error, will attempt restart.");
        }
      };

      recognition.onend = () => {
        // If user still wants listening, instantiate fresh recognition after short delay
        if (isListeningRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              spawnRecognition();
            }
          }, 200);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      return recognition;
    } catch (err: any) {
      console.warn("Could not start SpeechRecognition:", err);
      if (err.name === "InvalidStateError") {
        // Already active
      } else {
        setSpeechError("Could not start speech recognition: " + (err.message || String(err)));
      }
      return null;
    }
  }, []);

  const startListening = useCallback(async () => {
    setSpeechError(null);

    // 1. Explicitly request microphone stream to trigger browser permission dialog if needed
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop tracks - we only needed permission verification
        testStream.getTracks().forEach((track) => track.stop());
      } catch (micErr: any) {
        console.warn("Microphone getUserMedia error:", micErr);
        if (
          micErr.name === "NotAllowedError" ||
          micErr.name === "PermissionDeniedError"
        ) {
          setSpeechError(
            "Microphone access denied. Click the lock/camera icon in your address bar to allow mic access."
          );
          setIsListening(false);
          isListeningRef.current = false;
          return;
        }
        if (micErr.name === "NotFoundError" || micErr.name === "DevicesNotFoundError") {
          setSpeechError("No microphone found on this device.");
          setIsListening(false);
          isListeningRef.current = false;
          return;
        }
      }
    }

    // 2. Set active listening flag and spawn SpeechRecognition instance
    isListeningRef.current = true;
    setIsListening(true);
    spawnRecognition();
  }, [spawnRecognition]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const speakFeedback = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !ttsEnabledRef.current) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.85;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("TTS synthesis error:", err);
    }
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    transcriptRef,
    lastSpokenAt,
    lastSpokenAtRef,
    speechError,
    setTranscript,
    startListening,
    stopListening,
    clearTranscript,
    speakFeedback,
  };
}
