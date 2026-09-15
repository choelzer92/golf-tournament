'use client';

import { useState, useEffect } from 'react';
import { type Player } from '@/lib/game-state';
import { QrImage } from '@/components/qr-image';
import { type PoolGame, ensureShareToken } from '@/lib/pool-game';
import { ORGANIZER_TOKEN, isAppOwner } from '@/lib/invite-gate';
import { getCreatorGhin } from '@/lib/pool-identity';
import { getGameMode } from '@/lib/game-modes';
import { saveFormat, formatFromGame, attachFormatToGroup } from '@/lib/pool-formats';
import { type RosterGroup, hydrateGroups, getGroupById } from '@/lib/roster-groups';

// Save the current game's format (mode + all settings, no players) to the Format
// Library so it can be reused/duplicated later. Name defaults to the game name;
// a "share with everyone" toggle stores it as a shared format (owner_ghin null).
export function SaveFormatModal({ game, onClose }: { game: PoolGame; onClose: () => void }) {
  const [name, setName] = useState(game.name);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const modeName = getGameMode(game.gameMode)?.name
    ?? (game.moneyMode === 'match' ? 'Head-to-head match' : 'Pool (pot split)');

  // F-046: a game that came FROM a group saves its format TO that group (opt-out). "Save
  // format" used to write to the flat library only — Craig saved "friday game in the friday
  // group" and the group never learned about it, so the next Friday round couldn't offer it.
  const [sourceGroup, setSourceGroup] = useState<RosterGroup | null>(null);
  const [attachToGroup, setAttachToGroup] = useState(true);
  useEffect(() => {
    if (!game.sourceGroupId) return;
    hydrateGroups({ viewerGhin: getCreatorGhin(), isOwner: isAppOwner() })
      .then(() => {
        const g = getGroupById(game.sourceGroupId!);
        if (g && g.defaults?.kind !== 'format') setSourceGroup(g);
      })
      .catch(() => {});
  }, [game.sourceGroupId]);

  async function doSave() {
    setSaving(true);
    try {
      const saved = await saveFormat(name, formatFromGame(game), { shared });
      if (attachToGroup && sourceGroup) await attachFormatToGroup(sourceGroup, saved.id);
      setDone(true);
      setTimeout(onClose, 900);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Save as format</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Saves this game&apos;s <span className="font-medium">{modeName}</span> setup (no players) to your Format
          Library — reuse it to start a new game or spin off a variant.
        </p>
        <label className="block text-sm font-medium text-gray-800 mb-1">Format name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {/* F-046: offered only when the game came from a group. Default ON — "I saved it in
            the friday group" is what saving from a group's game means to the organizer. */}
        {sourceGroup && (
          <label className="flex items-start gap-2 cursor-pointer mt-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" checked={attachToGroup} onChange={(e) => setAttachToGroup(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-gray-800">Attach to {sourceGroup.name}</span>
              <span className="block text-xs text-gray-500">Listed as one of the group&apos;s usual games when you start its next round.</span>
            </span>
          </label>
        )}
        <label className="flex items-start gap-2 cursor-pointer mt-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-gray-800">Share with everyone</span>
            <span className="block text-xs text-gray-500">Others with a pool link can use this format too. Off = only you.</span>
          </span>
        </label>
        <button
          onClick={doSave}
          disabled={saving || !name.trim() || done}
          className="mt-4 w-full rounded-md bg-green-700 px-4 py-2.5 text-white font-medium hover:bg-green-800 disabled:opacity-50"
        >
          {done ? 'Saved ✓' : saving ? 'Saving…' : 'Save format'}
        </button>
      </div>
    </div>
  );
}

export function SharePanel({ game, onSave, onClose }: { game: PoolGame; onSave: (g: PoolGame) => void; onClose: () => void }) {
  const [copiedKey, setCopiedKey] = useState<'player' | 'organizer' | null>(null);
  const gameId = game.id;
  const gameName = game.name;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // This game's OWN share token. Older games have none, so mint one on first open
  // and persist it — that makes every game's link individually revocable instead of
  // sharing one constant across every game ever created.
  useEffect(() => {
    const { token, created } = ensureShareToken(game);
    if (created) onSave({ ...game, shareToken: token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  // NOTE: no "replace link" UI on purpose. Regenerating game.shareToken is all a
  // revoke needs (see generateShareToken), but exposing a red button on the screen
  // whose whole job is "send this to your group" solves a problem this app's users
  // don't have yet — and adds exposed complexity, which the north star treats as
  // the enemy. Add it when someone actually needs to kill a leaked link.

  // Player scoring link: opens THIS game's hub with 'pool' access (the token
  // skips the invite code). The other foursome opens it, taps "Enter scores"
  // for their team, and scores with NO GHIN login. This is what lets each group
  // post their own foursome's scores to the shared leaderboard.
  const playerLink = `${origin}/pool/${gameId}?key=${game.shareToken ?? ORGANIZER_TOKEN}`;
  // Organizer link: opens pool setup to create/manage games (a different job —
  // for a co-organizer, not for players joining THIS game). Still the shared
  // constant: it grants a ROLE and exists before any game does, so it can't be
  // per-game. Goes to co-organizers you trust, not a whole group chat.
  const organizerLink = `${origin}/pool/new?key=${ORGANIZER_TOKEN}`;

  async function shareLink(url: string, title: string, key: 'player' | 'organizer') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch { /* clipboard blocked — user can long-press the field */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Share “{gameName}”</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        {/* Primary: player scoring link for THIS game */}
        <p className="text-sm font-semibold text-gray-800">Player scoring link</p>
        <p className="text-xs text-gray-500 mb-2">
          Send this to the other foursomes. It opens <span className="font-medium">this</span> game — each group taps their own team and enters their scores. No login or invite code needed; everyone&apos;s scores land on the same leaderboard.
        </p>
        <div className="flex gap-2">
          <input readOnly value={playerLink} className="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600" onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => shareLink(playerLink, `Join & score: ${gameName}`, 'player')} className="flex-shrink-0 rounded-md bg-green-700 px-3 py-1.5 text-sm text-white font-medium hover:bg-green-800">
            {copiedKey === 'player' ? 'Copied!' : 'Share'}
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <QrImage data={playerLink} alt="QR code — open this game to enter scores" className="rounded-lg border border-gray-200" />
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-1">Or scan to open this game on a phone</p>

        {/* Secondary: organizer link to CREATE games (collapsed emphasis) */}
        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-800">Organizer link</p>
          <p className="text-xs text-gray-500 mb-2">
            For a co-organizer who needs to <span className="font-medium">create</span> their own games. Opens game setup, not this game.
          </p>
          <div className="flex gap-2">
            <input readOnly value={organizerLink} className="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600" onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => shareLink(organizerLink, 'Create a game', 'organizer')} className="flex-shrink-0 rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-700 font-medium hover:bg-gray-300">
              {copiedKey === 'organizer' ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
