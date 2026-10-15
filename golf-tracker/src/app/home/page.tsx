'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTournamentList, getTournamentListVisibleTo, hydrateTournaments } from '@/lib/tournament-state';
import {
  getPoolGameList,
  getPoolGameListVisibleTo,
  hydratePoolGames,
  loadPoolGame,
  type PoolGame,
} from '@/lib/pool-game';
import { unstartedGameIds } from '@/lib/stats-ledger';
import { gameListSubtitle } from '@/lib/game-modes/result';
import { buildHomeFeed, type FeedItem, type HomeFeed } from '@/lib/home-feed';
import { shortDate } from '@/lib/series';
import { EVENT_SEED_KEY, RERUN_SEED_KEY, type EventSeed } from '@/lib/group-seed';
import { getViewer, hydrateGroups, upsertGroup, type RosterGroup } from '@/lib/roster-groups';
import { getViewablePlayerGroups } from '@/lib/pool-formats';
import { hydrateRoster } from '@/lib/roster';
import { clearAccessCookie, isAppOwner } from '@/lib/invite-gate';
import { clearGhinIdentity, getCreatorGhin, getCreatorName } from '@/lib/pool-identity';
import { SOLO_ROUNDS } from '@/lib/flags';
import { FeedbackButton } from '@/components/feedback-box';

// PHASE 1 Home hub — a user-centric landing that only READS existing data:
// your groups, your active/recent games (pool + tournament merged), and a
// "start something" chooser that opens the existing wizards. Nothing here
// writes to Supabase. Reachable only by a `full` user (a `pool` share-link
// visitor is redirected off non-/pool routes by InviteGate). Flag-gated via
// This is the DEFAULT landing page for a logged-in `full` user as of 2026-08-12
// (HOME_V2 = true). It is no longer the read-only Phase 1 it was written as: the group
// page it links to is a dashboard, and Stats & money enforces the group-scoped money rule
// (DECISIONS.md §5h). The header links to /dashboard, which is now the course and GHIN lookups (§5.cw d).

const statusPill: Record<'setup' | 'active' | 'completed', string> = {
  active: 'bg-green-100 text-green-800',
  setup: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-600',
};
const statusWord = { active: 'live', setup: 'not started', completed: 'final' } as const;
const OTHER_SHOWN = 5;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// The latest dated round's day, when any round has one (§5.dc: dates are optional).
const lastDate = (rounds: { series?: { date?: string } }[]): string[] => {
  const d = [...rounds].reverse().find((r) => r.series?.date)?.series?.date;
  return d ? [shortDate(d)] : [];
};

// One feed item as a row: what it is, its name, and one line saying where it stands.
function describe(item: FeedItem, unstarted: Set<string>): { pill: string; pillClass: string; name: string; status: 'setup' | 'active' | 'completed'; line: string; href: string } {
  if (item.kind === 'event') {
    const done = item.rounds.filter((r) => r.status === 'completed').length;
    return {
      pill: 'Event', pillClass: 'bg-emerald-100 text-emerald-800', name: item.name,
      status: item.live ? 'active' : done === item.rounds.length ? 'completed' : 'setup',
      line: [`${item.rounds.length} ${item.rounds.length === 1 ? 'round' : 'rounds'}`, `${done} finished`, ...lastDate(item.rounds)].join(' · '),
      href: `/event/${item.seriesId}`,
    };
  }
  if (item.kind === 'tournament') {
    const t = item.tournament;
    return {
      // The legacy multi-round builder (§5.cs Q1). "Event" now means a Series (§5.cv).
      pill: 'Tournament', pillClass: 'bg-purple-100 text-purple-700', name: t.name, status: t.status,
      line: `${t.teamAName} ${t.teamAPoints} — ${t.teamBPoints} ${t.teamBName}`,
      href: `/tournament/${t.id}`,
    };
  }
  const g = item.game;
  return {
    // §5.cw a: live with no score yet reads "not started".
    pill: 'Game', pillClass: 'bg-blue-100 text-blue-700', name: g.name,
    status: g.status === 'active' && unstarted.has(g.id) ? 'setup' : g.status,
    line: `${dateOf(g.createdAt)} · ${gameListSubtitle(g)}`,
    href: `/pool/${g.id}`,
  };
}

export default function HomePage() {
  const router = useRouter();
  // F-127 A (§5.di): Run it back straight from Home's finished-game card, as the hub's button does
  // (B1, §5.cm): a stale wizard draft must not mix into the rerun.
  function runItBack(gameId: string) {
    sessionStorage.removeItem('pool_wizard_draft');
    sessionStorage.setItem(RERUN_SEED_KEY, gameId);
    router.push('/pool/new');
  }
  const rerunButton = (item: FeedItem, status: string) => (item.kind === 'game' && status === 'completed' ? (
    <button
      type="button"
      onClick={() => runItBack(item.game.id)}
      className="w-full text-left border-t border-gray-100 px-4 py-2 min-h-[44px] text-sm font-medium text-green-700 hover:bg-green-50 rounded-b-lg"
    >
      Run it back
    </button>
  ) : null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [unstarted, setUnstarted] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  // §5.ck: the "Other games" list shows the newest few; the rest are one tap away.
  const [allOther, setAllOther] = useState(false);
  // F-055 (§5.bh): groups are created HERE — /pool/roster is saved players only.
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  // F-059: owner-only affordances (feedback read-back) hide for members.
  const [ownerView, setOwnerView] = useState(false);

  useEffect(() => {
    // A logged-in convenience: mirror the dashboard's gate — no GHIN token means
    // not logged in, so send them to the login page.
    const token = sessionStorage.getItem('ghin_token');
    if (!token) {
      router.push('/');
      return;
    }

    const isOwner = isAppOwner();
    setOwnerView(isOwner);
    const ghin = getCreatorGhin();
    setName(getCreatorName());

    // Read-only hydration. The owner (full access) sees every game; anyone else sees the
    // games they made, played in, or that belong to a group they're in (§5.cb). Group
    // membership is by roster id, so the roster loads too.
    Promise.all([
      hydratePoolGames(),
      hydrateTournaments(),
      hydrateGroups({ viewerGhin: ghin, isOwner }).catch(() => []),
      hydrateRoster({ viewerGhin: ghin, isOwner }).catch(() => []),
    ]).then(async () => {
      const viewer = getViewer(ghin);
      const visibleGroups = getViewablePlayerGroups();
      const games = isOwner ? getPoolGameList() : getPoolGameListVisibleTo(viewer);
      // §5.cw a: a live game with no score yet (set up ahead) gets no Continue card.
      const liveGames = games.filter((g) => g.status === 'active')
        .map((g) => loadPoolGame(g.id)).filter((g): g is PoolGame => !!g);
      const notStarted = await unstartedGameIds(liveGames).catch(() => new Set<string>());
      setUnstarted(notStarted);
      setFeed(buildHomeFeed(
        games,
        isOwner ? getTournamentList() : getTournamentListVisibleTo(viewer),
        new Set(visibleGroups.map((g) => g.id)),
        notStarted,
      ));
      setGroups(visibleGroups);
      setReady(true);
    });
  }, [router]);

  // Create a group and land on its dashboard — members, formats, rename, and
  // delete all live there (F-055). Ownership mirrors the old roster manager:
  // tagged to the creator's GHIN so a scoped organizer only ever sees their own.
  async function createGroup() {
    const name = newGroupName.trim();
    if (!name || savingGroup) return;
    setSavingGroup(true);
    try {
      const group: RosterGroup = {
        id: crypto.randomUUID(),
        name,
        ownerGhin: getCreatorGhin(),
        playerIds: [],
        defaults: null,
      };
      await upsertGroup(group);
      router.push(`/home/groups/${group.id}`);
    } finally {
      setSavingGroup(false);
    }
  }

  // Sign Out is a FULL exit (F-047): forget the GHIN session, the durable
  // identity mirror, AND the invite-gate cookie — the button must do what it
  // says on a borrowed phone. Next visit re-enters the invite code.
  function logout() {
    sessionStorage.clear();
    clearGhinIdentity();
    clearAccessCookie();
    router.push('/');
  }

  // §5.cv: "Start an event" outside a group: the wizard opens Review on "new event, round 1".
  function startEvent() {
    sessionStorage.removeItem('pool_wizard_draft');
    const seed: EventSeed = { mode: 'new' };
    sessionStorage.setItem(EVENT_SEED_KEY, JSON.stringify(seed));
    router.push('/pool/new');
  }

  if (!ready || !feed) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  // F-124: a first-time organizer has nothing yet, so they aren't greeted as a returner.
  const firstVisit = groups.length === 0 && feed.live.length === 0 && feed.liveTournaments.length === 0
    && feed.latestByGroup.size === 0 && feed.other.length === 0;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Golf Tracker</h1>
            {name && <p className="text-sm text-green-200">{firstVisit ? 'Welcome' : 'Welcome back'}, {name}</p>}
          </div>
          <div className="flex items-center gap-4">
            <FeedbackButton />
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-green-200 hover:text-white"
            >
              Course &amp; GHIN lookup
            </button>
            <button onClick={logout} className="text-sm text-green-200 hover:text-white">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* §5.ck: any live game gets a Continue card at the very top, whatever its group. */}
        {(feed.live.length > 0 || feed.liveTournaments.length > 0) && (
          <section aria-label="Continue" className="space-y-2">
            {feed.live.map(({ game, event }) => (
              <div key={game.id} className="rounded-lg bg-green-800 text-white shadow-md">
                <button
                  onClick={() => router.push(`/pool/${game.id}`)}
                  className="w-full text-left px-5 py-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-green-200">▶ Continue</p>
                  <p className="font-bold text-lg">{event ? `${event.name} · ${game.name}` : game.name}</p>
                  <p className="text-sm text-green-100">{gameListSubtitle(game)}</p>
                </button>
                {event && (
                  <button
                    onClick={() => router.push(`/event/${event.id}`)}
                    className="w-full border-t border-green-700 px-5 py-2 text-left text-sm text-green-100 hover:text-white"
                  >
                    Event standings →
                  </button>
                )}
              </div>
            ))}
            {feed.liveTournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/tournament/${t.id}`)}
                className="w-full text-left rounded-lg bg-green-800 text-white shadow-md px-5 py-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-green-200">▶ Continue</p>
                <p className="font-bold text-lg">{t.name}</p>
                <p className="text-sm text-green-100">{t.teamAName} {t.teamAPoints} — {t.teamBPoints} {t.teamBName}</p>
              </button>
            ))}
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Start something</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push('/pool/new')}
              className="flex-1 rounded-lg bg-green-700 px-6 py-5 text-white text-left hover:bg-green-800 shadow-md"
            >
              <p className="font-bold text-lg">New game</p>
              <p className="text-sm text-green-100 mt-0.5">A single round — pool, skins, 2v2, and more.</p>
            </button>
            {/* §5.cv Q3: replaces the legacy "Multi-round event" builder for new play. */}
            <button
              onClick={startEvent}
              className="flex-1 rounded-lg bg-green-900 px-6 py-5 text-white text-left hover:bg-green-950 shadow-md"
            >
              <p className="font-bold text-lg">Start an event</p>
              <p className="text-sm text-green-100 mt-0.5">Several rounds, like a trip. The money adds up and settles at the end.</p>
            </button>
          </div>
          {SOLO_ROUNDS && (
            <button
              onClick={() => router.push('/solo')}
              className="mt-3 w-full rounded-lg bg-emerald-700 px-6 py-5 text-white text-left hover:bg-emerald-800 shadow-md"
            >
              <p className="font-bold text-lg">Solo round 🎤</p>
              <p className="text-sm text-emerald-100 mt-0.5">
                Play by yourself — log each shot by voice or tap and learn how far you really hit each club.
              </p>
            </button>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Your groups</h2>
            {/* F-055: creation lives here (the old Manage → /pool/roster button
                pointed at a second group manager, since deleted). Everything
                else — members, formats, rename, delete — is on the group's
                own dashboard, one tap into a card below. */}
            <button
              onClick={() => setCreatingGroup((c) => !c)}
              className="text-sm text-green-700 hover:text-green-900 font-medium"
            >
              {creatingGroup ? 'Cancel' : '+ New group'}
            </button>
          </div>
          {creatingGroup && (
            <form
              className="flex gap-2 mb-3"
              onSubmit={(e) => { e.preventDefault(); void createGroup(); }}
            >
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Weekend Warriors)…"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={!newGroupName.trim() || savingGroup}
                className="rounded-md bg-green-700 px-3 py-2 text-sm text-white font-medium hover:bg-green-800 disabled:opacity-50"
              >
                {savingGroup ? 'Creating…' : 'Create'}
              </button>
            </form>
          )}
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No groups yet. Create one — a named set of your regulars that fills a new game&apos;s field in one tap.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map((grp) => {
                const latest = feed.latestByGroup.get(grp.id);
                const d = latest ? describe(latest, unstarted) : null;
                return (
                  <div key={grp.id} className="bg-white rounded-lg shadow" data-testid="group-card">
                    <button
                      onClick={() => router.push(`/home/groups/${grp.id}`)}
                      className="w-full text-left p-4 pb-3 hover:bg-gray-50 rounded-t-lg"
                    >
                      <p className="font-medium text-gray-900">{grp.name}</p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {grp.playerIds.length} player{grp.playerIds.length !== 1 ? 's' : ''}
                      </p>
                    </button>
                    {/* §5.ck: the group's latest game or event, one tap to continue. */}
                    {d && (
                      <button
                        onClick={() => router.push(d.href)}
                        className="w-full text-left border-t border-gray-100 px-4 py-2.5 hover:bg-gray-50 rounded-b-lg"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${d.pillClass}`}>{d.pill}</span>
                          <span className="text-sm font-medium text-gray-900 truncate">{d.name}</span>
                          <span className={`ml-auto shrink-0 text-xs px-2 py-0.5 rounded-full ${statusPill[d.status]}`}>{statusWord[d.status]}</span>
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5">{d.line}</span>
                      </button>
                    )}
                    {latest && d && rerunButton(latest, d.status)}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* §5.ck: games and events made outside any group you can see. A group's own history
            lives on its page. */}
        <section aria-label="Other games">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {groups.length > 0 ? 'Other games' : 'Your golf'}
          </h2>
          {feed.other.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              {feed.latestByGroup.size > 0
                ? 'Nothing outside your groups. Each group’s games are on its page.'
                : <>No games yet. Tap <span className="font-medium">Start something</span> above to begin.</>}
            </p>
          ) : (
            <div className="space-y-2">
              {(allOther ? feed.other : feed.other.slice(0, OTHER_SHOWN)).map((item) => {
                const d = describe(item, unstarted);
                return (
                  <div key={item.key} className="bg-white rounded-lg shadow">
                  <button
                    onClick={() => router.push(d.href)}
                    className={`w-full text-left p-4 hover:shadow-md transition rounded-lg ${d.status === 'completed' ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${d.pillClass}`}>{d.pill}</span>
                        <p className="font-medium text-gray-900 truncate">{d.name}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusPill[d.status]}`}>{statusWord[d.status]}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{d.line}</p>
                  </button>
                  {rerunButton(item, d.status)}
                  </div>
                );
              })}
              {feed.other.length > OTHER_SHOWN && (
                <button onClick={() => setAllOther((v) => !v)} className="text-sm text-green-700 hover:text-green-900 font-medium">
                  {allOther ? 'Show fewer' : `Show all ${feed.other.length}`}
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Stats &amp; money</h2>
          <button
            onClick={() => router.push('/home/stats')}
            className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition"
          >
            <p className="font-medium text-gray-900">Money ledger &amp; standings →</p>
            <p className="text-sm text-gray-500 mt-1">
              Who owes whom across your games — overall, by group, by game, or by player.
            </p>
          </button>
          {/* App-owner only (F-059): the read-back shows EVERYONE's notes, so the
              link hides for members and the page itself re-checks isAppOwner().
              A quiet link, not a card — reading feedback is an occasional owner
              chore, not a daily surface. */}
          {ownerView && (
            <button
              onClick={() => router.push('/home/feedback')}
              className="mt-2 text-sm text-green-700 hover:text-green-900 font-medium"
            >
              Read feedback notes →
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
