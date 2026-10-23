"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

export function useThinkAloudSpeech(options: { autoSpeak?: boolean } = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastSpokenAt, setLastSpokenAt] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const ttsEnabledRef = useRef(options.autoSpeak ?? false);

  useEffect(() => {
    ttsEnabledRef.current = options.autoSpeak ?? false;
  }, [options.autoSpeak]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i][0];
        if (event.results[i].isFinal) {
          finalTranscript += item.transcript + " ";
        } else {
          finalTranscript += item.transcript;
        }
      }
      const trimmed = finalTranscript.trim();
      if (trimmed) {
        setTranscript(trimmed);
        setLastSpokenAt(Date.now());
      }
    };

    recognition.onerror = (err: any) => {
      if (err.error !== "no-speech") {
        console.warn("SpeechRecognition error:", err.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if user intended to keep listening
      if (isListening) {
        try {
          recognition.start();
        } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [isListening]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.warn("Could not start speech recognition:", e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      setIsListening(false);
    } catch (e) {
      console.warn("Could not stop speech recognition:", e);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setLastSpokenAt(null);
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
    startListening,
    stopListening,
    clearTranscript,
    speakFeedback,
  };
}
