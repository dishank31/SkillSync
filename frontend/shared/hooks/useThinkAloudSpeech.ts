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
  const ttsEnabledRef = useRef(options.autoSpeak ?? false);

  useEffect(() => {
    ttsEnabledRef.current = options.autoSpeak ?? false;
  }, [options.autoSpeak]);

  const clearTranscript = useCallback(() => {
    setTranscriptState("");
    setLastSpokenAt(null);
  }, []);

  const setTranscript = useCallback((text: string) => {
    setTranscriptState(text);
    setLastSpokenAt(Date.now());
  }, []);

  // Initialize SpeechRecognition once
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
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
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i][0];
          if (item && item.transcript) {
            fullTranscript += item.transcript + " ";
          }
        }
        const trimmed = fullTranscript.trim();
        if (trimmed) {
          setTranscriptState(trimmed);
          setLastSpokenAt(Date.now());
          setSpeechError(null);
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event.error;
        console.warn("SpeechRecognition error event:", errType);

        if (errType === "not-allowed" || errType === "service-not-allowed") {
          setSpeechError("Microphone permission denied. Click the lock/camera icon in your address bar to allow mic access.");
          isListeningRef.current = false;
          setIsListening(false);
        } else if (errType === "audio-capture") {
          setSpeechError("No microphone found on your system.");
          isListeningRef.current = false;
          setIsListening(false);
        } else if (errType === "network") {
          setSpeechError("Network error contacting speech service. You can also type callouts directly.");
        } else if (errType === "no-speech") {
          // Normal silence, keep listening
        }
      };

      recognition.onend = () => {
        // Auto-restart if user still wants to listen
        if (isListeningRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e: any) {
                // If already started or aborting, ignore
              }
            }
          }, 200);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } catch (err: any) {
      console.warn("Speech recognition creation error:", err);
      setIsSupported(false);
    }

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

  const startListening = useCallback(() => {
    setSpeechError(null);
    if (!recognitionRef.current) {
      const SpeechRecognition =
        typeof window !== "undefined"
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (!SpeechRecognition) {
        setSpeechError("Web Speech API not supported in this browser. Use Chrome, Edge, or type your callout below.");
        setIsSupported(false);
        return;
      }
    }

    isListeningRef.current = true;
    setIsListening(true);

    try {
      recognitionRef.current.start();
    } catch (err: any) {
      // If recognition is already started, don't crash
      if (err.name === "InvalidStateError") {
        console.log("Speech recognition is already running.");
      } else {
        console.warn("Could not start speech recognition:", err);
        setSpeechError("Could not start microphone: " + (err.message || String(err)));
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
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
    lastSpokenAt,
    speechError,
    setTranscript,
    startListening,
    stopListening,
    clearTranscript,
    speakFeedback,
  };
}
