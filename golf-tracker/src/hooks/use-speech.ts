'use client';

// Thin wrapper over the Web Speech API (SpeechRecognition). Voice is the
// primary way to log a shot, but it isn't universal — Firefox/Android and some
// embedded webviews lack it — so `isSupported` lets the UI fall back to tap
// chips cleanly (no mic button at all when unsupported). Transcription itself
// is handled by the browser vendor's service (needs network); the tap fallback
// covers a dead signal. We never auto-commit a result: the caller parses the
// transcript, pre-fills chips, and the user confirms.

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings — the DOM lib doesn't ship SpeechRecognition.
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResult { 0: SpeechRecognitionAlternative; isFinal: boolean; length: number }
interface SpeechRecognitionResultList { length: number; [i: number]: SpeechRecognitionResult }
interface SpeechRecognitionEventLike { results: SpeechRecognitionResultList }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeech {
  isSupported: boolean;
  listening: boolean;
  transcript: string;        // live transcript (updates on interim results)
  finalTranscript: string;   // only set when a result is marked final — drive
                             // side effects (logging, commits) off THIS, not the
                             // interim transcript which fires many times.
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeech(): UseSpeech {
  const [isSupported, setIsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = '';
      let finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        text += t;
        if (e.results[i].isFinal) finalText += t;
      }
      setTranscript(text.trim());
      if (finalText.trim()) setFinalTranscript(finalText.trim());
    };
    rec.onerror = (e) => {
      setError(e.error ?? 'speech error');
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { /* ignore */ }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    setTranscript('');
    setFinalTranscript('');
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if already started — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
    setError(null);
  }, []);

  return { isSupported, listening, transcript, finalTranscript, error, start, stop, reset };
}
