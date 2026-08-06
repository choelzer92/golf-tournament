'use client';

// Spoken confirmation via SpeechSynthesis. Without it hands-free mode isn't
// actually hands-free: you'd still have to look at the screen to know whether a
// shot registered, which is the thing we're trying to avoid. With it the phone
// stays in your pocket — "seven iron, logged" is all the feedback you need.
//
// Note this is OUTPUT (speech synthesis), unrelated to the recognition in
// use-speech.ts. It's local, free, and works offline; no network needed.
//
// One real interaction to be careful about: speaking out loud while the mic is
// open means the recognizer can hear us and transcribe our own confirmation as
// if it were the user. Keeping confirmations SHORT and free of club/command
// vocabulary avoids feeding the parser its own words. "Logged" is safe; "seven
// iron logged" would be echoed back and re-parsed, so the club name is spoken
// only when the utterance can't loop (see `speakShot`).

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSay {
  supported: boolean;
  say: (text: string) => void;
  cancel: () => void;
}

export function useSay(enabled: boolean): UseSay {
  const [supported, setSupported] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);
    // Voices load asynchronously on most engines; grab a local English one when
    // they arrive. Falling back to the default voice is fine.
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voice.current =
        voices.find((v) => v.lang.startsWith('en') && v.localService) ??
        voices.find((v) => v.lang.startsWith('en')) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick);
  }, []);

  const say = useCallback(
    (text: string) => {
      if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        // Cancel anything queued so confirmations never pile up behind each
        // other — the latest shot is the only one you care about hearing.
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (voice.current) u.voice = voice.current;
        u.rate = 1.1;   // brisk; these are 1-3 word phrases
        u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch {
        /* synthesis unavailable — the on-screen state is still correct */
      }
    },
    [enabled],
  );

  const cancel = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }, []);

  // Never leave an utterance playing after unmount.
  useEffect(() => () => cancel(), [cancel]);

  return { supported, say, cancel };
}
