'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  CLUB_KINDS,
  SHAPES,
  SHORT_GAME_SHAPES,
  SHAPE_LABEL,
  OUTCOME_LABEL,
  clubLabel,
  clubsOfKind,
  type ClubId,
  type ShapeTag,
} from '@/lib/clubs';
import {
  fetchSoloRound,
  loadRoundLocal,
  saveRoundLocal,
  saveSoloRound,
  flushSoloRound,
  newerRound,
  localIsAhead,
  loadHandsFreePref,
  saveHandsFreePref,
  playedTee,
  feetToBucket,
  appendVoiceLog,
  type SoloRound,
  type HoleLog,
  type Shot,
  type ShotKind,
} from '@/lib/solo-round';
import {
  shotDistances,
  strokesForHole,
  holeStarted,
  countsForClubAverage,
  ACCURACY_LIMIT_M,
} from '@/lib/shot-distance';
import {
  parseShot,
  parseProximity,
  parseCommand,
  parseOutcome,
  looksLikeOutcome,
  hasWakeWord,
  type ParsedCommand,
  type ParsedOutcome,
} from '@/lib/shot-voice';
import { useGeo } from '@/hooks/use-geo';
import { useSpeech } from '@/hooks/use-speech';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useSay } from '@/hooks/use-say';

// The active solo round — where a player logs each shot. Voice is primary
// (speak "full 6 iron" → chips pre-fill → Log); tap chips are the always-on
// fallback. GPS is captured at Log time from a warm watchPosition fix so
// shot-to-shot deltas yield real distances (see shot-distance.ts). Round state
// is local-first: every change writes localStorage synchronously and debounces
// a Supabase upsert, so a dead signal on the course never loses shots.

interface DraftShot {
  kind: ShotKind;
  club?: ClubId;
  shape: ShapeTag[];
  targetYds?: number; // aimed distance on an approach, said at address
}

const emptyDraft = (): DraftShot => ({ kind: 'full', shape: [] });

export default function SoloRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [round, setRound] = useState<SoloRound | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [currentHole, setCurrentHole] = useState<number>(0); // index into round.holes
  const [draft, setDraft] = useState<DraftShot>(emptyDraft());
  const [editingShotId, setEditingShotId] = useState<string | null>(null);

  // Hands-free: mic stays open for the whole round and voice commands drive it.
  // Starts from the saved preference (set once, on every round after that), but
  // only engages while the round is live.
  const [handsFree, setHandsFree] = useState(false);
  useEffect(() => { setHandsFree(loadHandsFreePref()); }, []);

  const geo = useGeo(round?.status === 'playing');
  const speech = useSpeech({ auto: handsFree && round?.status === 'playing' });
  // Spoken confirmations, so the phone can stay in your pocket. Only in
  // hands-free — in push-to-talk you're already looking at the screen.
  const say = useSay(handsFree);
  // Hold the screen awake while the round is live so the GPS watch stays warm
  // between shots (a sleeping phone stops the watch → shots log without a fix).
  const wakeLock = useWakeLock(round?.status === 'playing');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest round with an un-flushed debounced save, so teardown can push it.
  const pendingSave = useRef<SoloRound | null>(null);

  // Load: local-first (offline-safe), then reconcile with Supabase by updatedAt.
  useEffect(() => {
    const local = loadRoundLocal(id);
    if (local) {
      setRound(local);
      setCurrentHole(firstUnfinishedIndex(local));
    }
    fetchSoloRound(id).then((server) => {
      const best = newerRound(local, server);
      if (!best) {
        if (!local) setNotFound(true);
        return;
      }
      setRound(best);
      if (!local) setCurrentHole(firstUnfinishedIndex(best));
      // Local ahead of the server means shots were logged offline (or a save was
      // lost). Push it now, or the server copy stays stale until the next
      // mutation — which would lose those shots on another device.
      if (localIsAhead(local, server)) saveSoloRound(local!);
    });
  }, [id]);

  // Persist any round mutation: bump updatedAt, set state, write localStorage
  // immediately, debounce the Supabase upsert (~600ms) like the play page.
  const mutate = useCallback((fn: (r: SoloRound) => SoloRound) => {
    setRound((prev) => {
      if (!prev) return prev;
      const next = { ...fn(prev), updatedAt: new Date().toISOString() };
      saveRoundLocal(next);
      pendingSave.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        pendingSave.current = null;
        saveSoloRound(next);
      }, 600);
      return next;
    });
  }, []);

  // Flush a pending debounced save on teardown. Cancelling the timer without
  // flushing (the old behavior) silently dropped the upsert when you left the
  // page — or the OS evicted the tab — within 600ms of logging a shot.
  // `pagehide` is the reliable mobile-Safari teardown signal; `visibilitychange`
  // covers backgrounding the app for a call or a text.
  useEffect(() => {
    const flush = () => {
      const pending = pendingSave.current;
      if (!pending) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      pendingSave.current = null;
      flushSoloRound(pending);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  // Every finalized utterance is routed here, in priority order:
  //   1. COMMAND  ("next hole", "made a five", "undo")
  //   2. OUTCOME  ("thinned it", "missed it left") → attaches to the LAST shot
  //   3. SHOT     ("soft 7", "driver")             → the next shot
  //
  // Commands go first so navigation can never be read as a club. Outcomes go
  // before shots because "pulled it left" contains no club and would otherwise
  // fall through to an empty shot parse.
  //
  // AUTO-COMMIT: in hands-free mode a confident shot parse commits immediately —
  // no "log it" needed, because you announce at the ball and the wake word is
  // what makes that safe. An open mic hears your partners and the cart radio, so
  // without the wake word requirement a phantom shot would corrupt the per-club
  // averages this feature exists to produce. In push-to-talk mode nothing
  // auto-commits (you already tapped to speak, so you can tap to log).
  // Keyed off the FINAL transcript so interim partials don't fire this per word.
  useEffect(() => {
    const said = speech.finalTranscript;
    if (!said) return;

    // Hands-free: ignore anything not addressed to the app.
    const addressed = !handsFree || hasWakeWord(said);
    if (!addressed) {
      // Still logged — useful for tuning, and proves what was filtered out.
      mutate((r) => appendVoiceLog(r, {
        ts: new Date().toISOString(),
        hole: r.holes[currentHole]?.hole ?? 0,
        transcript: said,
        parsed: JSON.stringify({ ignored: 'no wake word' }),
      }));
      speech.reset();
      return;
    }

    const command = parseCommand(said);
    const outcome = !command && looksLikeOutcome(said) ? parseOutcome(said) : undefined;
    const parsed = command || outcome ? undefined : parseShot(said);

    mutate((r) => appendVoiceLog(r, {
      ts: new Date().toISOString(),
      hole: r.holes[currentHole]?.hole ?? 0,
      transcript: said,
      parsed: JSON.stringify(command ? { command } : outcome ? { outcome } : parsed),
    }));

    if (command) {
      switch (command.type) {
        case 'log':      void logShot(); say.say('logged'); break;
        case 'nextHole': {
          const next = Math.min(round!.holes.length - 1, currentHole + 1);
          setCurrentHole(next);
          say.say(`hole ${round!.holes[next]?.hole ?? ''}`);
          break;
        }
        case 'prevHole': {
          const prev = Math.max(0, currentHole - 1);
          setCurrentHole(prev);
          say.say(`hole ${round!.holes[prev]?.hole ?? ''}`);
          break;
        }
        case 'undo':     undoLastShot(); say.say('removed'); break;
        case 'cancel':   setDraft(emptyDraft()); setEditingShotId(null); say.say('cleared'); break;
        case 'setPutts': setPuttsTo(command.value ?? 0); say.say(`${command.value} putts`); break;
        case 'holeScore': void closeOutHole(command); break;
        case 'goToHole': {
          const idx = round!.holes.findIndex((h) => h.hole === command.value);
          if (idx >= 0) { setCurrentHole(idx); say.say(`hole ${command.value}`); }
          break;
        }
      }
      speech.reset();
      return;
    }

    if (outcome && (outcome.direction || outcome.strike)) {
      applyOutcomeToLastShot(outcome, said);
      say.say('got it');
      speech.reset();
      return;
    }

    if (parsed) {
      const merged = {
        kind: parsed.kind,
        club: parsed.club ?? draft.club,
        shape: parsed.shape.length ? parsed.shape : draft.shape,
        targetYds: parsed.targetYds ?? draft.targetYds,
      };
      setDraft(merged);
      // Confident + hands-free → log it right now. `confidence` is 'high' only
      // when a club (or a putt) was actually identified, so a half-heard phrase
      // still waits for confirmation rather than inventing a shot.
      if (handsFree && parsed.confidence === 'high' && (merged.club || merged.kind === 'putt')) {
        void logShot(merged, said);
        // Confirm with the club so you can catch a misparse by ear. Safe to
        // speak a club name here: the recognizer is closed while we talk (it
        // reopens on our restart cycle), and a stray echo would need the wake
        // word to be acted on anyway.
        say.say(`${clubLabel(merged.club) || 'putt'}, logged`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalTranscript]);

  if (notFound) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-500 py-16">
          Round not found. <button onClick={() => router.push('/solo')} className="text-green-700 underline">Back to solo</button>
        </p>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  const hole = round.holes[currentHole];
  const tee = playedTee(round);
  const teeHole = tee?.holes.find((h) => h.number === hole.hole);
  const dists = shotDistances(hole);

  const isPutt = draft.kind === 'putt';
  const isChip = draft.kind === 'chip';
  const canLog = isPutt || !!draft.club;

  function setKind(kind: ShotKind) {
    setDraft((d) => ({
      ...d,
      kind,
      club: kind === 'putt' ? 'Putter' : d.club,
      // drop short-game shape tags when leaving chip mode
      shape: kind === 'chip' ? d.shape : d.shape.filter((s) => !SHORT_GAME_SHAPES.includes(s)),
      // target only makes sense for a full/approach shot
      targetYds: kind === 'full' ? d.targetYds : undefined,
    }));
  }

  function toggleShape(tag: ShapeTag) {
    setDraft((d) => ({
      ...d,
      shape: d.shape.includes(tag) ? d.shape.filter((s) => s !== tag) : [...d.shape, tag],
    }));
  }

  // `override` lets the voice path commit the freshly-parsed draft directly:
  // setDraft is async, so reading `draft` here would see the PREVIOUS shot and
  // log the wrong club. `saidRaw` is the transcript to attach.
  async function logShot(override?: DraftShot, saidRaw?: string) {
    const d = override ?? draft;
    const usable = d.kind === 'putt' || !!d.club;
    if (!usable) return;
    const pos = d.kind === 'putt' ? undefined : (await geo.snapshot()) ?? undefined;
    // Preserve any proximity already recorded on the shot being edited (the
    // walk-up value is entered separately, not in this draft).
    const existing = editingShotId
      ? round!.holes[currentHole]?.shots.find((s) => s.id === editingShotId)
      : undefined;
    const shot: Shot = {
      id: editingShotId ?? crypto.randomUUID(),
      kind: d.kind,
      club: d.kind === 'putt' ? undefined : d.club,
      shape: d.shape,
      pos: editingShotId ? preserveOrReplacePos(round!, currentHole, editingShotId, pos) : pos,
      targetYds: d.kind === 'full' ? d.targetYds : undefined,
      direction: existing?.direction,
      strike: existing?.strike,
      outcomeRaw: existing?.outcomeRaw,
      proximityFeet: existing?.proximityFeet,
      proximity: existing?.proximity,
      // Keep the ORIGINAL transcript when editing. Overwriting it with whatever
      // the mic last heard would destroy the record of what produced the bad
      // parse — which is the thing that makes a hand-correction useful later.
      raw: editingShotId ? existing?.raw : (saidRaw ?? speech.transcript ?? undefined),
    };

    // A hand-edit of a voice-logged shot is a labelled example: the transcript
    // plus what it SHOULD have produced. Record it so the grammar can be fixed
    // from real mistakes instead of guesses.
    const isCorrection =
      !!editingShotId &&
      !!existing?.raw &&
      (existing.club !== shot.club ||
        existing.kind !== shot.kind ||
        existing.targetYds !== shot.targetYds ||
        existing.shape.join(',') !== shot.shape.join(','));

    mutate((r) => {
      const holes = r.holes.map((h, i) => {
        if (i !== currentHole) return h;
        if (d.kind === 'putt') {
          // Putts are a counter, not individual shots — but still allow editing.
          return editingShotId ? h : { ...h, putts: h.putts + 1 };
        }
        const shots = editingShotId
          ? h.shots.map((s) => (s.id === editingShotId ? shot : s))
          : [...h.shots, shot];
        return { ...h, shots };
      });
      const next = { ...r, holes };
      if (!isCorrection) return next;
      return appendVoiceLog(next, {
        ts: new Date().toISOString(),
        hole: next.holes[currentHole]?.hole ?? 0,
        transcript: existing!.raw!,
        parsed: JSON.stringify({
          club: existing!.club, shape: existing!.shape,
          kind: existing!.kind, targetYds: existing!.targetYds,
        }),
        corrected: JSON.stringify({
          club: shot.club, shape: shot.shape,
          kind: shot.kind, targetYds: shot.targetYds,
        }),
        correctedFrom: existing!.raw,
      });
    });
    setDraft(emptyDraft());
    setEditingShotId(null);
    speech.reset();
  }

  function editShot(s: Shot) {
    setEditingShotId(s.id);
    setDraft({ kind: s.kind, club: s.club, shape: s.shape, targetYds: s.targetYds });
  }

  // Record how close a chip ended up — entered when you walk up to the ball.
  function setProximity(shotId: string, feet: number | undefined) {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) =>
        i !== currentHole
          ? h
          : {
              ...h,
              shots: h.shots.map((s) =>
                s.id === shotId
                  ? {
                      ...s,
                      proximityFeet: feet,
                      proximity: feet != null ? feetToBucket(feet) : undefined,
                    }
                  : s,
              ),
            },
      ),
    }));
  }

  function deleteShot(shotId: string) {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) => (i === currentHole ? { ...h, shots: h.shots.filter((s) => s.id !== shotId) } : h)),
    }));
    if (editingShotId === shotId) { setEditingShotId(null); setDraft(emptyDraft()); }
  }

  function setPutts(delta: number) {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) => (i === currentHole ? { ...h, putts: Math.max(0, h.putts + delta) } : h)),
    }));
  }

  // Absolute putt count, for the voice command ("two putts") — the +/- buttons
  // are relative, but a spoken number is the total.
  function setPuttsTo(count: number) {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) => (i === currentHole ? { ...h, putts: Math.max(0, count) } : h)),
    }));
  }

  // Attach a spoken outcome ("thinned it", "missed it left") to the most recent
  // shot on this hole — outcome is reported AFTER the swing, so it belongs to the
  // shot already logged, not the draft. Silently ignored if nothing is logged
  // yet (you narrated before announcing a club).
  function applyOutcomeToLastShot(outcome: ParsedOutcome, saidRaw: string) {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) => {
        if (i !== currentHole || h.shots.length === 0) return h;
        const lastIdx = h.shots.length - 1;
        return {
          ...h,
          shots: h.shots.map((s, si) =>
            si !== lastIdx
              ? s
              : {
                  ...s,
                  direction: outcome.direction ?? s.direction,
                  strike: outcome.strike ?? s.strike,
                  outcomeRaw: saidRaw,
                },
          ),
        };
      }),
    }));
  }

  // "I made a five" / "that's a bogey" — closes out the hole. The announced
  // score is AUTHORITATIVE for the scorecard: putts are derived as
  // score - shots-logged, so a shot you forgot to announce shows up as an extra
  // putt rather than a wrong score. `scoreSaid` records that it came from you,
  // which lets the summary flag holes where the numbers didn't line up.
  async function closeOutHole(cmd: ParsedCommand) {
    const h = round!.holes[currentHole];
    const par = h.par;
    const gross = cmd.value ?? (cmd.relativeToPar != null ? par + cmd.relativeToPar : undefined);
    if (gross == null) return;

    // Capture position at the hole so the approach shot has a measurable
    // endpoint — without this the last full swing of every hole gets no
    // distance, which is the most valuable club on the card.
    const pos = (await geo.snapshot()) ?? undefined;

    mutate((r) => ({
      ...r,
      holes: r.holes.map((hole, i) => {
        if (i !== currentHole) return hole;
        const shots = hole.shots.length;
        return {
          ...hole,
          putts: Math.max(0, gross - shots),
          scoreSaid: gross,
          holedPos: pos ?? hole.holedPos,
          firstPuttFeet: cmd.proximityFeet ?? hole.firstPuttFeet,
        };
      }),
    }));
    // Move on automatically — holing out means the hole is done.
    const nextIdx = Math.min(round!.holes.length - 1, currentHole + 1);
    setCurrentHole(nextIdx);
    setDraft(emptyDraft());
    const rel = gross - par;
    const name = rel === 0 ? 'par' : rel === -1 ? 'birdie' : rel === 1 ? 'bogey' : `${gross}`;
    say.say(`${name}. hole ${round!.holes[nextIdx]?.hole ?? ''}`);
  }

  // Voice "undo" — drop the most recent thing logged on this hole. Prefers the
  // last shot; falls back to decrementing putts when there are no shots left.
  function undoLastShot() {
    mutate((r) => ({
      ...r,
      holes: r.holes.map((h, i) => {
        if (i !== currentHole) return h;
        if (h.shots.length > 0) return { ...h, shots: h.shots.slice(0, -1) };
        return { ...h, putts: Math.max(0, h.putts - 1) };
      }),
    }));
    setEditingShotId(null);
    setDraft(emptyDraft());
  }

  function finish() {
    mutate((r) => ({ ...r, status: 'finished' }));
    router.push(`/solo/${id}/summary`);
  }

  const toParThru = round.holes
    .slice(0, currentHole + 1)
    .reduce((s, h) => (holeStarted(h) ? s + strokesForHole(h) - h.par : s), 0);

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push('/solo')} className="text-sm text-green-200 hover:text-white">
            ← Rounds
          </button>
          <p className="text-sm font-medium truncate px-2">{round.course.courseName}</p>
          <div className="flex items-center gap-1.5">
            {wakeLock === 'active' && (
              <span title="Screen stays awake — GPS stays warm" className="text-xs text-green-200">
                ☀
              </span>
            )}
            <GpsBadge status={geo.status} accuracy={geo.last?.accuracy} />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Hole nav */}
        <div className="flex items-center justify-between bg-white rounded-lg shadow p-3">
          <button
            onClick={() => setCurrentHole((i) => Math.max(0, i - 1))}
            disabled={currentHole === 0}
            className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 disabled:opacity-40"
          >
            ←
          </button>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">Hole {hole.hole}</p>
            <p className="text-xs text-gray-500">
              Par {hole.par}
              {teeHole ? ` · ${teeHole.yardage} yds · SI ${teeHole.handicap}` : ''}
            </p>
          </div>
          <button
            onClick={() => setCurrentHole((i) => Math.min(round.holes.length - 1, i + 1))}
            disabled={currentHole === round.holes.length - 1}
            className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 disabled:opacity-40"
          >
            →
          </button>
        </div>

        {/* Running score */}
        <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
          <span>
            Hole: <span className="font-semibold text-gray-900">{strokesForHole(hole)}</span> stroke
            {strokesForHole(hole) !== 1 ? 's' : ''}
          </span>
          <span>
            Thru {currentHole + 1}:{' '}
            <span className="font-semibold text-gray-900">
              {toParThru === 0 ? 'E' : toParThru > 0 ? `+${toParThru}` : toParThru}
            </span>
          </span>
        </div>

        {/* Shot list */}
        <ShotList
          hole={hole}
          dists={dists}
          editingId={editingShotId}
          onEdit={editShot}
          onDelete={deleteShot}
          onSetProximity={setProximity}
        />

        {/* Log a shot */}
        <section className="bg-white rounded-lg shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{editingShotId ? 'Edit shot' : 'Log a shot'}</h3>
            {editingShotId && (
              <button
                onClick={() => { setEditingShotId(null); setDraft(emptyDraft()); }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Cancel edit
              </button>
            )}
          </div>

          {/* Voice */}
          {speech.isSupported && (
            <div>
              {/* Hands-free keeps the mic open all round so you never tap. */}
              <label className="flex items-center justify-between gap-2 mb-2 cursor-pointer">
                <span className="text-sm text-gray-700">
                  Hands-free
                  <span className="block text-[11px] text-gray-500">
                    Mic stays on. Start with &ldquo;caddy&rdquo; and it logs as you talk.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={handsFree}
                  onChange={(e) => { setHandsFree(e.target.checked); saveHandsFreePref(e.target.checked); }}
                  className="h-5 w-9 shrink-0 accent-green-700"
                />
              </label>

              {handsFree ? (
                <div
                  className={`w-full rounded-md px-4 py-3 text-center font-medium ${speech.listening ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-gray-100 border border-gray-300 text-gray-600'}`}
                >
                  {speech.listening ? '● Listening — just talk' : 'Mic idle — tap below to wake it'}
                </div>
              ) : (
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  className={`w-full rounded-md px-4 py-3 font-medium text-white ${speech.listening ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-700 hover:bg-green-800'}`}
                >
                  {speech.listening ? '● Listening… tap to stop' : '🎤 Say your shot'}
                </button>
              )}

              {/* In hands-free the mic can be closed by the OS (a call, a long
                  silence); this re-opens it without leaving the page. */}
              {handsFree && (
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  className="mt-1.5 w-full rounded-md border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                >
                  {speech.listening ? 'Pause mic' : '🎤 Wake mic'}
                </button>
              )}

              {speech.transcript && (
                <p className="text-xs text-gray-500 mt-1">Heard: &ldquo;{speech.transcript}&rdquo;</p>
              )}
              {speech.error && <p className="text-xs text-amber-700 mt-1">Voice unavailable — use the buttons below.</p>}
              {handsFree && (
                <div className="text-[11px] text-gray-400 mt-1 space-y-0.5">
                  <p>At the ball: &ldquo;caddy, soft 7, about 180 out&rdquo; — logs immediately.</p>
                  <p>After: &ldquo;caddy, thinned it left&rdquo; · At the hole: &ldquo;caddy, I made a 5&rdquo;</p>
                  <p>Also: &ldquo;caddy, undo&rdquo; · &ldquo;caddy, next hole&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {/* Kind toggle */}
          <div className="flex gap-2">
            {(['full', 'chip', 'putt'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${draft.kind === k ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'}`}
              >
                {k === 'full' ? 'Full swing' : k}
              </button>
            ))}
          </div>

          {/* Club chips (hidden for putts) */}
          {!isPutt && (
            <div className="space-y-2">
              {CLUB_KINDS.filter((k) => k !== 'putter').map((kind) => (
                <div key={kind} className="flex flex-wrap gap-1.5">
                  {clubsOfKind(kind).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setDraft((d) => ({ ...d, club: c.id }))}
                      className={`rounded-md border px-2.5 py-1.5 text-sm ${draft.club === c.id ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Shape chips */}
          {!isPutt && (
            <div className="flex flex-wrap gap-1.5">
              {(isChip ? [...SHORT_GAME_SHAPES, ...SHAPES] : SHAPES).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleShape(tag)}
                  className={`rounded-full border px-3 py-1 text-xs ${draft.shape.includes(tag) ? 'border-green-600 bg-green-100 text-green-800' : 'border-gray-300 bg-white text-gray-600 hover:border-green-400'}`}
                >
                  {SHAPE_LABEL[tag]}
                </button>
              ))}
            </div>
          )}

          {/* Approach target — how far to the pin (optional, full shots) */}
          {draft.kind === 'full' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">To pin</label>
              <input
                type="number"
                inputMode="numeric"
                value={draft.targetYds ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, targetYds: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="yds"
                className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <span className="text-xs text-gray-400">optional — or say &ldquo;160 to the pin&rdquo;</span>
            </div>
          )}
          {isChip && (
            <p className="text-xs text-gray-500">
              You&rsquo;ll be asked how close you got when you walk up to the ball.
            </p>
          )}

          <button
            onClick={() => void logShot()}
            disabled={!canLog}
            className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {editingShotId ? 'Save shot' : isPutt ? 'Add putt' : 'Log shot'}
          </button>
        </section>

        {/* Putts stepper */}
        <section className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Putts</p>
            <p className="text-xs text-gray-500">Counted, not measured</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPutts(-1)}
              disabled={hole.putts === 0}
              className="h-10 w-10 rounded-full border border-gray-300 text-xl text-gray-700 disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center text-xl font-bold text-gray-900">{hole.putts}</span>
            <button
              onClick={() => setPutts(1)}
              className="h-10 w-10 rounded-full border border-green-600 bg-green-600 text-xl text-white"
            >
              +
            </button>
          </div>
        </section>

        {round.status === 'playing' && (
          <button
            onClick={finish}
            className="w-full rounded-md border border-green-700 px-4 py-3 text-green-700 font-medium hover:bg-green-50"
          >
            Finish round
          </button>
        )}
        {round.status === 'finished' && (
          <button
            onClick={() => router.push(`/solo/${id}/summary`)}
            className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800"
          >
            View summary
          </button>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function firstUnfinishedIndex(round: SoloRound): number {
  const idx = round.holes.findIndex((h) => !holeStarted(h));
  return idx === -1 ? round.holes.length - 1 : idx;
}

// When editing an existing shot, keep its original GPS position unless a new
// snapshot was captured — editing club/shape shouldn't move the ball.
function preserveOrReplacePos(round: SoloRound, holeIdx: number, shotId: string, newPos?: Shot['pos']) {
  const existing = round.holes[holeIdx]?.shots.find((s) => s.id === shotId);
  return newPos ?? existing?.pos;
}

// A reported mis-strike excludes the shot from its club's stock average.
function mishit(s: Shot): boolean {
  return !countsForClubAverage(s);
}

function GpsBadge({ status, accuracy }: { status: string; accuracy?: number }) {
  let text = 'GPS';
  let cls = 'bg-gray-500';
  if (status === 'watching' && accuracy != null) {
    const good = accuracy <= ACCURACY_LIMIT_M;
    text = `GPS ±${Math.round(accuracy)}m`;
    cls = good ? 'bg-green-600' : 'bg-amber-500';
  } else if (status === 'denied') {
    text = 'GPS off';
    cls = 'bg-red-600';
  } else if (status === 'unavailable') {
    text = 'No GPS';
    cls = 'bg-gray-500';
  } else if (status === 'watching') {
    text = 'GPS…';
    cls = 'bg-amber-500';
  }
  return <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full text-white ${cls}`}>{text}</span>;
}

function ShotList({
  hole,
  dists,
  editingId,
  onEdit,
  onDelete,
  onSetProximity,
}: {
  hole: HoleLog;
  dists: (number | null)[];
  editingId: string | null;
  onEdit: (s: Shot) => void;
  onDelete: (id: string) => void;
  onSetProximity: (shotId: string, feet: number | undefined) => void;
}) {
  if (hole.shots.length === 0 && hole.putts === 0) {
    return (
      <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4 text-center">
        No shots yet on this hole.
      </p>
    );
  }
  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
      {hole.shots.map((s, i) => {
        const d = dists[i];
        const weak = s.pos && s.pos.accuracy > ACCURACY_LIMIT_M;
        // A chip that hasn't had its walk-up proximity recorded yet.
        const needsProximity = s.kind === 'chip' && s.proximityFeet == null;
        return (
          <div key={s.id} className={editingId === s.id ? 'bg-green-50' : ''}>
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  <span className="text-gray-400 mr-2">{i + 1}.</span>
                  {s.kind === 'putt' ? 'Putt' : clubLabel(s.club)}
                  {s.shape.length > 0 && (
                    <span className="text-sm font-normal text-gray-500"> · {s.shape.map((t) => SHAPE_LABEL[t]).join(', ')}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {s.kind === 'chip' && s.proximityFeet != null ? `to ${s.proximityFeet} ft` : null}
                  {s.kind !== 'chip' && d != null ? `${Math.round(d)} yds${weak ? ' (weak GPS)' : ''}` : null}
                  {s.kind !== 'chip' && d == null && s.kind !== 'putt' ? '— (no distance)' : null}
                  {s.targetYds != null ? ` · aimed ${s.targetYds}` : null}
                </p>
                {/* Reported outcome — what actually happened, vs the intent
                    above. A mis-strike is called out because it means this
                    shot is excluded from the club's stock average. */}
                {(s.direction || s.strike) && (
                  <p className="text-xs mt-0.5">
                    <span className={mishit(s) ? 'text-amber-700' : 'text-gray-600'}>
                      {[s.strike && OUTCOME_LABEL[s.strike], s.direction && OUTCOME_LABEL[s.direction]]
                        .filter(Boolean)
                        .join(' · ')}
                      {mishit(s) ? ' — not in club average' : ''}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onEdit(s)} className="text-xs text-green-700 px-2 py-1 hover:underline">
                  Edit
                </button>
                <button onClick={() => onDelete(s.id)} className="text-xs text-red-600 px-2 py-1 hover:underline">
                  Delete
                </button>
              </div>
            </div>
            {needsProximity && (
              <ProximityPrompt onSet={(feet) => onSetProximity(s.id, feet)} />
            )}
          </div>
        );
      })}
      {hole.putts > 0 && (
        <div className="px-4 py-2.5 text-sm text-gray-600">
          {hole.putts} putt{hole.putts !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// Walk-up prompt for a chip: "How close did you get?" Answer by voice ("about
// eight feet"), by typing exact feet, or with a quick tap chip. Recorded when
// you reach the ball, not when you hit — matching the on-course flow.
const QUICK_FEET = [1, 3, 5, 8, 12, 18, 25];

function ProximityPrompt({ onSet }: { onSet: (feet: number) => void }) {
  const speech = useSpeech();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!speech.finalTranscript) return;
    const feet = parseProximity(speech.finalTranscript);
    if (feet != null) onSet(feet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalTranscript]);

  return (
    <div className="px-4 pb-3 -mt-1">
      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 space-y-2">
        <p className="text-xs font-medium text-amber-800">How close did you get?</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {speech.isSupported && (
            <button
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium text-white ${speech.listening ? 'bg-red-600 animate-pulse' : 'bg-green-700 hover:bg-green-800'}`}
            >
              {speech.listening ? '● …' : '🎤 Say it'}
            </button>
          )}
          {QUICK_FEET.map((f) => (
            <button
              key={f}
              onClick={() => onSet(f)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:border-green-400"
            >
              {f} ft
            </button>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (typed) { onSet(Number(typed)); setTyped(''); } }}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              inputMode="numeric"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="ft"
              className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button type="submit" className="rounded-md bg-green-700 px-2 py-1.5 text-xs text-white hover:bg-green-800">
              Set
            </button>
          </form>
        </div>
        {speech.transcript && <p className="text-[11px] text-gray-500">Heard: &ldquo;{speech.transcript}&rdquo;</p>}
      </div>
    </div>
  );
}
