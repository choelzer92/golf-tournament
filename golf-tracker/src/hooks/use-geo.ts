'use client';

// Warm GPS for the active round. We keep a live watchPosition running while the
// round screen is visible so the latest fix is always ready — logging a shot
// then snapshots it instantly instead of waiting several seconds for a cold
// getCurrentPosition. This is FOREGROUND-only: we stop the watch when the tab
// is hidden or the component unmounts (no background tracking, no battery
// drain, works as a plain web app). The distance model only needs a fix at the
// instant you log a shot from the ball, so that's all we capture.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsPoint } from '@/lib/solo-round';

export type GeoStatus = 'idle' | 'watching' | 'denied' | 'unavailable';

export interface UseGeo {
  status: GeoStatus;
  last: GpsPoint | null;   // most recent warm fix
  // Snapshot the freshest position for a shot. Resolves to a GpsPoint, or null
  // if permission is denied / no fix is available in time (shot still logs,
  // just without a position → no distance for that shot).
  snapshot: () => Promise<GpsPoint | null>;
}

function toPoint(p: GeolocationPosition): GpsPoint {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    ts: p.timestamp,
  };
}

export function useGeo(active: boolean): UseGeo {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [last, setLast] = useState<GpsPoint | null>(null);
  const lastRef = useRef<GpsPoint | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (watchId.current != null) return; // already watching
    setStatus('watching');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const pt = toPoint(p);
        lastRef.current = pt;
        setLast(pt);
        setStatus('watching');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else setStatus('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  }, []);

  // Watch only while active AND the tab is visible.
  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    const sync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') stop();
      else start();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stop();
    };
  }, [active, start, stop]);

  // Grab the freshest fix for a shot. Prefer a recent warm fix; otherwise do a
  // one-shot getCurrentPosition (short timeout) so a cold start still logs.
  const snapshot = useCallback((): Promise<GpsPoint | null> => {
    const warm = lastRef.current;
    if (warm && Date.now() - warm.ts < 6_000) return Promise.resolve(warm);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(warm ?? null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pt = toPoint(p);
          lastRef.current = pt;
          setLast(pt);
          resolve(pt);
        },
        () => resolve(warm ?? null),
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 8_000 },
      );
    });
  }, []);

  return { status, last, snapshot };
}
