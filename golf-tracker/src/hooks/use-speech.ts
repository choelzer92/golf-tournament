'use client';

// Thin wrapper over the Web Speech API (SpeechRecognition). Voice is the
// primary way to log a shot, but it isn't universal — Firefox/Android and some
// embedded webviews lack it — so `isSupported` lets the UI fall back to tap
// chips cleanly (no mic button at all when unsupported). Transcription itself
// is handled by the browser vendor's service (needs network); the tap fallback
// covers a dead signal. We never auto-commit a result: the caller parses the
// transcript, pre-fills chips, and the user confirms.
//
// Two modes:
//  - push-to-talk (default): one utterance per tap, recognition ends itself.
//  - hands-free (`auto: true`): stays listening for the whole round, restarting
//    itself after each utterance and after the idle timeouts the browser
//    imposes. Intended for on-course use where tapping a button before every
//    shot is the thing you're trying to avoid.
//
// `listening` tracks the ACTUAL engine state via onstart/onend rather than
// being set optimistically at call time — start() can silently fail (no
// permission, another tab holding the mic, an engine that was still shutting
// down), and a `listening` flag that lies leaves the UI stuck on "tap to stop".

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings — the DOM lib doesn't ship SpeechRecognition.
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResult { 0: SpeechRecognitionAlternative; isFinal: boolean; length: number }
interface SpeechRecognitionResultList { length: number; [i: number]: SpeechRecognitionResult }
interface SpeechRecognitionEventLike { results: SpeechRecognitionResultList; resultIndex: number }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
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

// Errors that mean "this attempt ended, but the mic is still usable" — safe to
// auto-restart from. `not-allowed`/`service-not-allowed` are permission denials
// and must NOT be retried (retrying spins forever and can wedge the engine).
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

export interface UseSpeechOptions {
  // Keep listening for the whole session, restarting after each utterance.
  auto?: boolean;
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

export function useSpeech(options: UseSpeechOptions = {}): UseSpeech {
  const { auto = false } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the user wants the mic open. Auto-restart only happens while this
  // is true, so an explicit stop() is never undone by the restart handler.
  const wanted = useRef(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) return; // isSupported stays false
    setIsSupported(true);
  }, []);

  // Build (or rebuild) the recognition instance. A fresh instance per session is
  // deliberate: reusing one that errored is unreliable across engines.
  const build = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = autoRef.current;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };

    rec.onresult = (e) => {
      // Only read results from this event onward. Accumulating over the whole
      // list re-emits earlier phrases in continuous mode, which would re-fire
      // the caller's effect and double-log.
      let interim = '';
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (interim.trim()) setTranscript(interim.trim());
      if (finalText.trim()) {
        setTranscript(finalText.trim());
        setFinalTranscript(finalText.trim());
      }
    };

    rec.onerror = (e) => {
      const code = e.error ?? 'speech error';
      // `no-speech` and `aborted` are routine in hands-free mode (a quiet gap,
      // or our own restart) — don't surface them as failures.
      if (code !== 'no-speech' && code !== 'aborted') setError(code);
      if (FATAL_ERRORS.has(code)) wanted.current = false;
    };

    rec.onend = () => {
      setListening(false);
      // Hands-free: the engine ends after each utterance and on idle timeouts,
      // so reopen it. Guarded by `wanted` so stop() wins, and deferred a tick
      // because start() throws if called synchronously from onend.
      if (wanted.current && autoRef.current) {
        setTimeout(() => {
          if (!wanted.current) return;
          try {
            recRef.current?.start();
          } catch {
            // Engine still shutting down — rebuild and try once more.
            const fresh = build();
            if (fresh) {
              recRef.current = fresh;
              try { fresh.start(); } catch { /* give up until next tap */ }
            }
          }
        }, 250);
      }
    };

    return rec;
  }, []);

  const start = useCallback(() => {
    if (!getCtor()) return;
    wanted.current = true;
    setError(null);
    setTranscript('');
    setFinalTranscript('');
    let rec = recRef.current;
    if (!rec) {
      rec = build();
      recRef.current = rec;
    }
    if (!rec) return;
    try {
      rec.start();
    } catch {
      // Already running (harmless) or wedged — rebuild and retry once.
      try { rec.abort(); } catch { /* ignore */ }
      const fresh = build();
      recRef.current = fresh;
      if (fresh) {
        try { fresh.start(); } catch { /* leave listening false; UI stays honest */ }
      }
    }
  }, [build]);

  const stop = useCallback(() => {
    wanted.current = false;
    const rec = recRef.current;
    // abort() over stop(): stop() waits to deliver a final result, which in
    // continuous mode can keep the engine open long enough to look stuck.
    try { rec?.abort(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
    setError(null);
  }, []);

  // Follow the `auto` flag: rebuild with the right `continuous` setting, and in
  // hands-free mode open the mic as soon as it's enabled.
  useEffect(() => {
    if (!getCtor()) return;
    if (auto) {
      wanted.current = true;
      const rec = build();
      recRef.current = rec;
      if (rec) { try { rec.start(); } catch { /* needs a user gesture — the tap does it */ } }
    }
    return () => {
      wanted.current = false;
      const rec = recRef.current;
      if (rec) {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try { rec.abort(); } catch { /* ignore */ }
      }
      recRef.current = null;
      setListening(false);
    };
  }, [auto, build]);

  // Release the mic while the app is backgrounded (a call, a text) and reopen it
  // on return if hands-free is still wanted. Holding it through a phone call
  // wedges the engine on several mobile browsers.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        const rec = recRef.current;
        try { rec?.abort(); } catch { /* ignore */ }
        setListening(false);
      } else if (wanted.current && autoRef.current) {
        try { recRef.current?.start(); } catch { /* onend restart will retry */ }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return { isSupported, listening, transcript, finalTranscript, error, start, stop, reset };
}
