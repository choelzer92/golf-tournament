'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament, TournamentRound } from '@/lib/tournament-state';
import { loadTournament, fetchTournament } from '@/lib/tournament-state';
import { FORMATS, TEAM_MODES, getTeamModeConfig } from '@/lib/formats';


interface RoundRules {
  overview: string;
  handicapCalc: string[];
  strokeAllocation: string[];
  scoring: string[];
  tournamentPoints: string[];
  bonuses?: string[];
  splitFormat?: {
    label: string;
    handicapCalc: string[];
    strokeAllocation: string[];
    scoring: string[];
    tournamentPoints: string[];
  };
  notes?: string[];
}

function buildHogsVDawgsRules(tournament: Tournament): Record<string, RoundRules> {
  const rules: Record<string, RoundRules> = {};

  for (const round of tournament.rounds) {
    const format = FORMATS.find((f) => f.id === round.formatId);
    const teamModeConfig = getTeamModeConfig(round.teamMode);
    const is9 = round.holesPlaying !== '18';

    const roundRules: RoundRules = {
      overview: buildOverview(round, format, teamModeConfig),
      handicapCalc: buildHandicapCalc(round, teamModeConfig, is9 || !!round.splitFormat),
      strokeAllocation: buildStrokeAllocation(round, teamModeConfig),
      scoring: buildScoring(round, format, teamModeConfig),
      tournamentPoints: buildTournamentPoints(round),
      bonuses: round.bonuses.length > 0 ? buildBonuses(round) : undefined,
      notes: buildNotes(round, teamModeConfig),
    };

    if (round.splitFormat) {
      const backTeamMode = getTeamModeConfig(round.splitFormat.teamMode);
      const backFormat = FORMATS.find((f) => f.id === round.splitFormat!.formatId) || format;
      roundRules.splitFormat = {
        label: `Back 9 — ${backFormat?.name || round.splitFormat.formatId} (${backTeamMode.name})`,
        handicapCalc: buildHandicapCalc(round, backTeamMode, true, round.splitFormat),
        strokeAllocation: buildStrokeAllocationSplit(round, backTeamMode),
        scoring: buildScoringSplit(round, backFormat, backTeamMode),
        tournamentPoints: buildTournamentPointsSplit(round),
      };
    }

    rules[round.id] = roundRules;
  }

  return rules;
}

function buildOverview(round: TournamentRound, format: typeof FORMATS[number] | undefined, teamMode: typeof TEAM_MODES[number]): string {
  const parts: string[] = [];
  parts.push(`${format?.name || round.formatId} — ${teamMode.name}`);
  if (round.holesPlaying === '18' && round.splitFormat) {
    const backFormat = FORMATS.find((f) => f.id === round.splitFormat!.formatId);
    const backTm = getTeamModeConfig(round.splitFormat.teamMode);
    parts.push(`Split format: Front 9 is ${format?.name} (${teamMode.name}), Back 9 is ${backFormat?.name || round.splitFormat.formatId} (${backTm.name})`);
  } else {
    parts.push(`${round.holesPlaying === '18' ? '18 holes' : round.holesPlaying === 'front9' ? 'Front 9' : 'Back 9'}`);
  }
  parts.push(`Scoring method: ${round.scoringMethod === 'match-play' ? 'Match Play (hole-by-hole)' : 'Stroke Play (total score)'}`);
  if (round.course) parts.push(`Course: ${round.course.courseName}`);
  return parts.join('\n');
}

function buildHandicapCalc(round: TournamentRound, teamMode: typeof TEAM_MODES[number], is9: boolean, splitConfig?: typeof round.splitFormat): string[] {
  const allowance = splitConfig ? splitConfig.handicapAllowance : round.handicapAllowance;
  const strokeMethod = splitConfig ? splitConfig.strokeMethod : round.strokeMethod;
  const basis = round.handicapBasis;
  const lines: string[] = [];

  if (basis === 'course') {
    lines.push('Course Handicap = (Handicap Index × Slope Rating / 113) + (Course Rating - Par)');
    if (is9) {
      lines.push('For 9 holes: Index is halved, then 9-hole Slope and Course Rating are used');
      lines.push('Formula: (Index ÷ 2) × (9-hole Slope / 113) + (9-hole CR - 9-hole Par)');
    }
  } else {
    lines.push('Handicap Basis: Raw Index (no course/slope adjustment)');
    if (is9) {
      lines.push('For 9 holes: Index is halved');
    }
  }

  if (allowance === -1) {
    lines.push('Allowance: USGA Tiered (Scramble) — Low player: 35%, High player: 15% (2-player); 20/15/10% (3-player); 20/15/10/5% (4-player)');
  } else {
    lines.push(`Allowance: ${allowance}% of course handicap`);
    const usgaRec = teamMode.usgaAllowance === 'tiered' ? 'Tiered' : `${teamMode.usgaAllowance}%`;
    if (allowance !== (teamMode.usgaAllowance === 'tiered' ? -1 : teamMode.usgaAllowance)) {
      lines.push(`(USGA recommends ${usgaRec} for ${teamMode.name})`);
    } else {
      lines.push(`(Matches USGA recommendation for ${teamMode.name})`);
    }
  }

  if (strokeMethod === 'off-the-low') {
    lines.push('Stroke Method: Off the low — lowest handicap player plays at 0, others get difference');
    lines.push('Playing Handicap = (Your Course Hcap × Allowance%) - (Low Player\'s Course Hcap × Allowance%)');
  } else {
    lines.push('Stroke Method: Full handicap — each player gets their full adjusted course handicap');
    lines.push('Playing Handicap = Your Course Hcap × Allowance%');
  }

  return lines;
}

function buildStrokeAllocation(round: TournamentRound, _teamMode: typeof TEAM_MODES[number]): string[] {
  const lines: string[] = [];
  const is9 = round.holesPlaying !== '18' || !!round.splitFormat;

  if (is9) {
    lines.push('Strokes are re-ranked 1-9 for the 9 holes being played');
    lines.push('Hole difficulty (handicap ranking) determines where strokes fall');
  } else {
    lines.push('Strokes are allocated by hole handicap ranking (1 = hardest, 18 = easiest)');
  }

  lines.push('If a player gets N strokes, they receive 1 stroke on the N hardest holes');
  lines.push('If strokes exceed hole count (e.g. 11 strokes on 9 holes), extra strokes double up on the hardest holes');

  return lines;
}

function buildStrokeAllocationSplit(_round: TournamentRound, _teamMode: typeof TEAM_MODES[number]): string[] {
  const lines: string[] = [];
  lines.push('Back 9 holes are re-ranked 1-9 independently');
  lines.push('Stroke allocation uses the back 9 difficulty ranking');
  lines.push('If strokes exceed 9, extra strokes double up starting from the hardest hole');
  return lines;
}

function buildScoring(round: TournamentRound, format: typeof FORMATS[number] | undefined, teamMode: typeof TEAM_MODES[number]): string[] {
  const lines: string[] = [];

  if (round.formatId === 'stableford') {
    const scale = (round.formatSettings?.stablefordScale as string) || 'standard';
    if (scale === 'standard') {
      lines.push('Stableford Point Scale (Standard):');
      lines.push('  Albatross or better: 5 pts | Eagle: 4 pts | Birdie: 3 pts | Par: 2 pts | Bogey: 1 pt | Double+: 0 pts');
    } else if (scale === 'modified') {
      lines.push('Stableford Point Scale (Modified):');
      lines.push('  Albatross+: +8 | Eagle: +5 | Birdie: +2 | Par: 0 | Bogey: -1 | Double+: -3');
    }
    lines.push('Points are based on NET score (gross score minus strokes received on that hole)');
  } else if (round.formatId === 'match-play') {
    if (teamMode.id === 'two-best-balls') {
      const variant = (round.formatSettings?.ballSelection as string) || '1-net-1-gross';
      if (variant === '1-net-1-gross') {
        lines.push('On each hole, each side combines their best net score (one player) + best gross score (a different player)');
        lines.push('The side with the lower combined total wins the hole; ties are halved');
      } else if (variant === '2-best-net') {
        lines.push('On each hole, each side combines their two best net scores');
        lines.push('The side with the lower combined total wins the hole; ties are halved');
      } else {
        lines.push('On each hole, each side combines their two best gross scores');
        lines.push('The side with the lower combined total wins the hole; ties are halved');
      }
    } else {
      lines.push('Each hole is won, lost, or halved based on net score');
    }
    lines.push('Net score = gross score - strokes received on that hole');
  } else if (round.formatId === 'stroke-play') {
    lines.push('Total net strokes determine the winner');
    lines.push('Net score per hole = gross score - strokes received on that hole');
  }

  lines.push('Each matchup is scored independently (your 2v2 or 1v1 group only — not the full team roster)');
  if (teamMode.id === 'best-ball') {
    lines.push('Matchup score: best (lowest net / highest points) individual score from your side on each hole');
  } else if (teamMode.id === 'two-best-balls') {
    const variant = (round.formatSettings?.ballSelection as string) || '1-net-1-gross';
    if (variant === '1-net-1-gross') {
      lines.push('Your side\'s hole score = best net (one player) + best gross (a different player)');
      lines.push('Compare that combined total to the other side\'s — lower wins the hole');
    } else if (variant === '2-best-net') {
      lines.push('Your side\'s hole score = two best net scores combined');
      lines.push('Compare to the other side\'s combined total — lower wins the hole');
    } else {
      lines.push('Your side\'s hole score = two best gross scores combined');
      lines.push('Compare to the other side\'s combined total — lower wins the hole');
    }
  } else if (teamMode.id === 'combined') {
    lines.push('Matchup score: all players on your side have their scores summed together');
  } else if (teamMode.id === 'individual') {
    lines.push('1v1 — each player\'s individual score is compared directly to their opponent');
  }

  return lines;
}

function buildScoringSplit(round: TournamentRound, _format: typeof FORMATS[number] | undefined, teamMode: typeof TEAM_MODES[number]): string[] {
  const lines: string[] = [];
  const sf = round.splitFormat!;

  if (sf.formatId === 'match-play' || sf.scoringMethod === 'match-play') {
    lines.push('Each hole is won, lost, or halved based on net score');
    lines.push('Net score = gross score - strokes received on that hole');
  } else if (sf.formatId === 'stableford') {
    lines.push('Stableford points based on net score per hole');
  } else {
    lines.push('Net stroke play — lowest total net wins');
  }

  if (teamMode.id === 'individual') {
    if (sf.pairings && sf.pairings.length > 0) {
      lines.push(`Individual 1v1 pairings on the back 9 (${sf.pairings.length} matches)`);
      lines.push('Each pairing is an independent match — strokes are calculated off the low within each pair');
    } else {
      lines.push('Individual 1v1 — one player per side');
    }
  } else if (teamMode.id === 'best-ball') {
    lines.push('Team score: best individual net score from the team on each hole');
  }

  return lines;
}

function buildTournamentPoints(round: TournamentRound): string[] {
  const lines: string[] = [];

  if (round.scoringMethod === 'match-play') {
    lines.push(`Points per hole: Win = ${round.pointsForWin}, Tie = ${round.pointsForTie}, Loss = ${round.pointsForLoss}`);
    lines.push('Team with more total hole points wins the matchup');
  } else {
    if (round.tournamentPointMode === 'margin-based') {
      const baseline = round.marginBaseline ?? 9;
      const divisor = round.marginDivisor ?? 4;
      lines.push(`Margin-Based Scoring (baseline: ${baseline} pts each)`);
      lines.push(`Every ${divisor} point(s) of margin = 1 tournament point swing (every ${divisor / 2} = 0.5 pt)`);
      lines.push(`Tie = ${baseline}-${baseline}. Maximum = ${baseline * 2}-0 (blowout cap).`);
      lines.push(`Example: Team A wins by ${divisor * 2} stableford pts → A gets ${baseline + 2}, B gets ${baseline - 2}`);
    } else {
      lines.push(`Fixed Points: Win = ${round.pointsForWin}, Tie = ${round.pointsForTie}, Loss = ${round.pointsForLoss}`);
      lines.push('Winner is determined by total team score across all holes');
    }
  }

  return lines;
}

function buildTournamentPointsSplit(round: TournamentRound): string[] {
  const lines: string[] = [];
  const sf = round.splitFormat!;

  if (sf.scoringMethod === 'match-play') {
    lines.push(`Back 9 points per hole: Win = ${sf.pointsForWin}, Tie = ${sf.pointsForTie}, Loss = ${sf.pointsForLoss}`);
    if (sf.pairings && sf.pairings.length > 0) {
      lines.push(`${sf.pairings.length} individual matches — each earns hole points independently`);
      lines.push('All back 9 points from all pairings are added to the team total');
    }
  } else {
    lines.push(`Back 9 matchup: Win = ${sf.pointsForWin}, Tie = ${sf.pointsForTie}, Loss = ${sf.pointsForLoss}`);
  }

  return lines;
}

function buildBonuses(round: TournamentRound): string[] {
  return round.bonuses.map((b) => {
    const scope = b.scope === 'per-matchup' ? 'per matchup' : 'per round';
    return `${b.name}: ${b.points} pt${b.points !== 1 ? 's' : ''} (${scope})`;
  });
}

function buildNotes(round: TournamentRound, teamMode: typeof TEAM_MODES[number]): string[] {
  const notes: string[] = [];

  if (teamMode.id === 'best-ball') {
    notes.push('USGA recommends 90% allowance for Best Ball to balance high and low handicappers');
  }
  if (teamMode.id === 'individual' && round.formatId === 'stableford') {
    notes.push('USGA recommends 95% allowance for individual Stableford');
  }
  if (round.strokeMethod === 'off-the-low') {
    notes.push('"Off the low" means the best player in the group plays at scratch (0 strokes) and everyone else gets the difference. This ensures fairness regardless of group strength.');
  }
  if (round.splitFormat) {
    notes.push('Split format: each 9 is scored independently. Handicap strokes are re-ranked 1-9 per side so strokes distribute evenly across each half.');
  }

  return notes;
}

export default function TournamentRulesPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  useEffect(() => {
    const cached = loadTournament(id);
    if (cached) setTournament(cached);
    fetchTournament(id).then((t) => {
      if (t) setTournament(t);
    });
  }, [id]);

  if (!tournament) return null;

  const rules = buildHogsVDawgsRules(tournament);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Scoring Rules</h1>
            <p className="text-xs text-green-200">{tournament.name}</p>
          </div>
          <button
            onClick={() => router.push(`/tournament/${id}`)}
            className="text-sm text-green-200 hover:text-white"
          >
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-900 mb-2">How It Works</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Each round awards tournament points to {tournament.teams[0].name} and {tournament.teams[1].name}. Points accumulate across all rounds — the team with the most points at the end wins.</p>
            <p>Handicap strokes are applied to equalize players of different skill levels. The formulas below show exactly how strokes are calculated and distributed.</p>
          </div>
        </div>

        {tournament.rounds.map((round) => {
          const roundRule = rules[round.id];
          if (!roundRule) return null;
          const isExpanded = expandedRound === round.id;

          return (
            <div key={round.id} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{round.dayLabel}</p>
                  <p className="text-xs text-gray-500">{roundRule.overview.split('\n')[0]}</p>
                </div>
                <span className="text-gray-400 text-lg">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-5">
                  {/* Overview */}
                  <Section title="Overview">
                    {roundRule.overview.split('\n').map((line, i) => (
                      <p key={i} className="text-sm text-gray-700">{line}</p>
                    ))}
                  </Section>

                  {/* Front 9 / Main format */}
                  <div className={roundRule.splitFormat ? 'border-l-4 border-blue-200 pl-3' : ''}>
                    {roundRule.splitFormat && (
                      <p className="text-xs font-bold text-blue-700 mb-2 uppercase">Front 9</p>
                    )}

                    <Section title="Handicap Calculation">
                      {roundRule.handicapCalc.map((line, i) => (
                        <p key={i} className={`text-sm ${line.startsWith('(') ? 'text-gray-500 italic' : 'text-gray-700'}`}>{line}</p>
                      ))}
                    </Section>

                    <Section title="Stroke Allocation">
                      {roundRule.strokeAllocation.map((line, i) => (
                        <p key={i} className="text-sm text-gray-700">{line}</p>
                      ))}
                    </Section>

                    <Section title="Scoring">
                      {roundRule.scoring.map((line, i) => (
                        <p key={i} className={`text-sm ${line.startsWith('  ') ? 'text-gray-600 font-mono text-xs' : 'text-gray-700'}`}>{line}</p>
                      ))}
                    </Section>

                    <Section title="Tournament Points">
                      {roundRule.tournamentPoints.map((line, i) => (
                        <p key={i} className={`text-sm ${line.startsWith('Example') ? 'text-gray-500 italic' : 'text-gray-700'}`}>{line}</p>
                      ))}
                    </Section>
                  </div>

                  {/* Back 9 split */}
                  {roundRule.splitFormat && (
                    <div className="border-l-4 border-red-200 pl-3 mt-4">
                      <p className="text-xs font-bold text-red-700 mb-2 uppercase">{roundRule.splitFormat.label}</p>

                      <Section title="Handicap Calculation">
                        {roundRule.splitFormat.handicapCalc.map((line, i) => (
                          <p key={i} className={`text-sm ${line.startsWith('(') ? 'text-gray-500 italic' : 'text-gray-700'}`}>{line}</p>
                        ))}
                      </Section>

                      <Section title="Stroke Allocation">
                        {roundRule.splitFormat.strokeAllocation.map((line, i) => (
                          <p key={i} className="text-sm text-gray-700">{line}</p>
                        ))}
                      </Section>

                      <Section title="Scoring">
                        {roundRule.splitFormat.scoring.map((line, i) => (
                          <p key={i} className="text-sm text-gray-700">{line}</p>
                        ))}
                      </Section>

                      <Section title="Tournament Points">
                        {roundRule.splitFormat.tournamentPoints.map((line, i) => (
                          <p key={i} className="text-sm text-gray-700">{line}</p>
                        ))}
                      </Section>
                    </div>
                  )}

                  {/* Bonuses */}
                  {roundRule.bonuses && roundRule.bonuses.length > 0 && (
                    <Section title="Bonus Points">
                      {roundRule.bonuses.map((line, i) => (
                        <p key={i} className="text-sm text-gray-700">{line}</p>
                      ))}
                    </Section>
                  )}

                  {/* Notes */}
                  {roundRule.notes && roundRule.notes.length > 0 && (
                    <Section title="Notes">
                      {roundRule.notes.map((line, i) => (
                        <p key={i} className="text-sm text-gray-500 italic">{line}</p>
                      ))}
                    </Section>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* USGA Reference */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-900 mb-2">USGA Handicap Allowance Reference</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              <p className="font-medium">Format</p>
              <p className="font-medium">USGA Recommended</p>
              <p>Individual (1v1)</p><p>100% off the low</p>
              <p>Best Ball (2v2)</p><p>90% off the low</p>
              <p>Two Best Balls</p><p>90% off the low</p>
              <p>Combined (All Count)</p><p>100% full handicap</p>
              <p>Scramble (2-player)</p><p>35% low / 15% high</p>
              <p>Scramble (3-player)</p><p>20% / 15% / 10%</p>
              <p>Scramble (4-player)</p><p>20% / 15% / 10% / 5%</p>
              <p>Alternate Shot</p><p>60%/40% weighting × 50%</p>
              <p>Individual Stroke Play</p><p>95% full handicap</p>
              <p>Individual Stableford</p><p>95% full handicap</p>
              <p>Best Ball Stroke Play</p><p>85% full handicap</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Key Concepts</h2>
          <div className="text-sm text-gray-700 space-y-3">
            <div>
              <p className="font-medium text-gray-900">Course Handicap</p>
              <p>Adjusts your Handicap Index to the specific course difficulty. A 10.0 index player might get 11 strokes on a hard course and 9 on an easy one.</p>
              <p className="text-xs text-gray-500 mt-0.5">Formula: (Index × Slope / 113) + (Course Rating - Par)</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Off the Low</p>
              <p>The lowest-handicap player in the matchup plays at 0 strokes. Everyone else receives the difference between their handicap and the low player's. This keeps matchups fair regardless of overall group strength.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Handicap Allowance</p>
              <p>A percentage applied to your course handicap before determining strokes. Prevents high-handicap players from having too large an advantage in certain formats. USGA publishes recommended percentages per format.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Stroke Allocation</p>
              <p>Your playing handicap (rounded) determines how many strokes you get. Those strokes are placed on holes by difficulty ranking — hardest holes first. If you get 5 strokes, holes ranked 1-5 (hardest to easiest) each give you one extra shot.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Stableford</p>
              <p>Points-based scoring that rewards birdies without overly punishing blowup holes. Your NET score on each hole earns points: par = 2, birdie = 3, eagle = 4, bogey = 1, double or worse = 0. Higher total wins.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Margin-Based Tournament Points</p>
              <p>Instead of "winner takes all," the margin of victory determines how many tournament points each team gets. A close match (small margin) splits nearly evenly; a blowout gives the winner significantly more. This rewards dominant performances.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
