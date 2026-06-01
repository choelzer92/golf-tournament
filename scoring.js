class TournamentScoring {
    constructor() {
        this.scores = this.loadScores();
    }

    loadScores() {
        const saved = localStorage.getItem('golf-tournament-2026');
        if (saved) return JSON.parse(saved);
        return {
            day1: { match1: { hs: Array(18).fill(null), jd: Array(18).fill(null) },
                    match2: { hs: Array(18).fill(null), jd: Array(18).fill(null) },
                    individual: {} },
            day2: { hs: {}, jd: {}, junk: { hs: 0, jd: 0 } },
            day3: { front: { match1: Array(9).fill(null), match2: Array(9).fill(null) },
                    back: { match1: Array(9).fill(null), match2: Array(9).fill(null),
                            match3: Array(9).fill(null), match4: Array(9).fill(null) } }
        };
    }

    saveScores() {
        localStorage.setItem('golf-tournament-2026', JSON.stringify(this.scores));
        if (window.firebaseSave) {
            window.firebaseSave(this.scores);
        }
    }

    // Day 1: Combined Stableford per hole comparison
    stablefordPoints(grossScore, par, strokesOnHole) {
        const netScore = grossScore - strokesOnHole;
        const diff = netScore - par;
        if (diff <= -3) return 5; // albatross
        if (diff === -2) return 4; // eagle
        if (diff === -1) return 3; // birdie
        if (diff === 0) return 2;  // par
        if (diff === 1) return 1;  // bogey
        return 0; // double or worse
    }

    calcDay1Match(matchKey) {
        const match = matchKey === 'match1' ? CONFIG.days.day1.matches[0] : CONFIG.days.day1.matches[1];
        const course = CONFIG.courses[CONFIG.days.day1.course];
        let hsPoints = 0;
        let jdPoints = 0;
        let holesPlayed = 0;

        const hsPlayers = match.hs;
        const jdPlayers = match.jd;

        for (let hole = 0; hole < 18; hole++) {
            const scores = this.scores.day1[matchKey];
            if (!scores || !scores.hs || !scores.jd) break;

            const hsScores = scores.hs[hole];
            const jdScores = scores.jd[hole];
            if (!hsScores || !jdScores) continue;

            holesPlayed++;
            let hsStableford = 0;
            let jdStableford = 0;

            // Calculate combined stableford for each team on this hole
            for (let p = 0; p < 2; p++) {
                if (hsScores[p] !== null) {
                    const hcap = getPlayerCourseHcap(hsPlayers[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[hole]);
                    hsStableford += this.stablefordPoints(hsScores[p], course.pars[hole], strokes);
                }
                if (jdScores[p] !== null) {
                    const hcap = getPlayerCourseHcap(jdPlayers[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[hole]);
                    jdStableford += this.stablefordPoints(jdScores[p], course.pars[hole], strokes);
                }
            }

            if (hsStableford > jdStableford) {
                hsPoints += 1;
            } else if (jdStableford > hsStableford) {
                jdPoints += 1;
            } else {
                hsPoints += 0.5;
                jdPoints += 0.5;
            }
        }

        return { hsPoints, jdPoints, holesPlayed };
    }

    calcDay1Individual() {
        // Track each player's total stableford across 18 holes
        const totals = {};
        const course = CONFIG.courses[CONFIG.days.day1.course];

        for (const matchKey of ['match1', 'match2']) {
            const match = matchKey === 'match1' ? CONFIG.days.day1.matches[0] : CONFIG.days.day1.matches[1];
            const allPlayers = [...match.hs, ...match.jd];
            const teams = ['hs', 'hs', 'jd', 'jd'];

            for (let pIdx = 0; pIdx < 4; pIdx++) {
                const playerKey = allPlayers[pIdx];
                const teamIdx = pIdx < 2 ? 'hs' : 'jd';
                const pInTeam = pIdx < 2 ? pIdx : pIdx - 2;
                totals[playerKey] = { total: 0, team: teamIdx };

                for (let hole = 0; hole < 18; hole++) {
                    const scores = this.scores.day1[matchKey];
                    if (!scores || !scores[teamIdx] || !scores[teamIdx][hole]) continue;
                    const gross = scores[teamIdx][hole][pInTeam];
                    if (gross === null) continue;

                    const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[hole]);
                    totals[playerKey].total += this.stablefordPoints(gross, course.pars[hole], strokes);
                }
            }
        }

        let best = { player: null, total: 0, team: null };
        for (const [key, val] of Object.entries(totals)) {
            if (val.total > best.total) {
                best = { player: key, total: val.total, team: val.team };
            }
        }
        return best;
    }

    // Day 2: Best Net + Best Gross (different players) per hole
    calcDay2() {
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = Object.keys(CONFIG.teams.hogSuckers.players).filter(k => k !== 'keith');
        const jdPlayers = Object.keys(CONFIG.teams.junkyardDawgs.players);

        let hsFront = 0, hsBack = 0, jdFront = 0, jdBack = 0;

        for (let hole = 0; hole < 18; hole++) {
            const hsHoleScores = this.scores.day2.hs[hole];
            const jdHoleScores = this.scores.day2.jd[hole];
            if (!hsHoleScores || !jdHoleScores) continue;

            const par = course.pars[hole];
            const strokeIdx = course.strokeIndex[hole];

            // Calc net and gross for each HS player
            const hsCalc = hsPlayers.map((p, i) => {
                const gross = hsHoleScores[i];
                if (gross === null) return null;
                const hcap = getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                const strokes = getStrokesOnHole(hcap, strokeIdx);
                return { player: p, gross, net: gross - strokes, idx: i };
            }).filter(Boolean);

            const jdCalc = jdPlayers.map((p, i) => {
                const gross = jdHoleScores[i];
                if (gross === null) return null;
                const hcap = getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                const strokes = getStrokesOnHole(hcap, strokeIdx);
                return { player: p, gross, net: gross - strokes, idx: i };
            }).filter(Boolean);

            // Best net and best gross must be different players
            const bestCombo = (calcs) => {
                if (calcs.length < 2) return { netScore: 99, grossScore: 99 };
                let bestTotal = 999;
                let result = { netScore: 99, grossScore: 99 };
                for (let i = 0; i < calcs.length; i++) {
                    for (let j = 0; j < calcs.length; j++) {
                        if (i === j) continue;
                        const total = (calcs[i].net - par) + (calcs[j].gross - par);
                        if (total < bestTotal) {
                            bestTotal = total;
                            result = { netScore: calcs[i].net - par, grossScore: calcs[j].gross - par };
                        }
                    }
                }
                return result;
            };

            const hsCombo = bestCombo(hsCalc);
            const jdCombo = bestCombo(jdCalc);
            const hsTotal = hsCombo.netScore + hsCombo.grossScore;
            const jdTotal = jdCombo.netScore + jdCombo.grossScore;

            if (hole < 9) {
                hsFront += hsTotal;
                jdFront += jdTotal;
            } else {
                hsBack += hsTotal;
                jdBack += jdTotal;
            }
        }

        const frontWinner = hsFront < jdFront ? 'hs' : (jdFront < hsFront ? 'jd' : 'tie');
        const backWinner = hsBack < jdBack ? 'hs' : (jdBack < hsBack ? 'jd' : 'tie');
        const overallHs = hsFront + hsBack;
        const overallJd = jdFront + jdBack;
        const overallWinner = overallHs < overallJd ? 'hs' : (overallJd < overallHs ? 'jd' : 'tie');

        let hsPoints = 0, jdPoints = 0;
        const scoring = CONFIG.days.day2.scoring;

        if (frontWinner === 'hs') hsPoints += scoring.front;
        else if (frontWinner === 'jd') jdPoints += scoring.front;
        else { hsPoints += scoring.front / 2; jdPoints += scoring.front / 2; }

        if (backWinner === 'hs') hsPoints += scoring.back;
        else if (backWinner === 'jd') jdPoints += scoring.back;
        else { hsPoints += scoring.back / 2; jdPoints += scoring.back / 2; }

        if (overallWinner === 'hs') hsPoints += scoring.overall;
        else if (overallWinner === 'jd') jdPoints += scoring.overall;
        else { hsPoints += scoring.overall / 2; jdPoints += scoring.overall / 2; }

        // Junk
        const junkHs = this.scores.day2.junk.hs || 0;
        const junkJd = this.scores.day2.junk.jd || 0;
        if (junkHs > junkJd) hsPoints += scoring.junk;
        else if (junkJd > junkHs) jdPoints += scoring.junk;
        else { hsPoints += scoring.junk / 2; jdPoints += scoring.junk / 2; }

        return { hsPoints, jdPoints, hsFront, jdFront, hsBack, jdBack };
    }

    // Day 3 Front: 2v2 best ball match play
    calcDay3Front() {
        let hsTotalPts = 0, jdTotalPts = 0;

        for (let m = 0; m < 2; m++) {
            const matchKey = `match${m + 1}`;
            const matchConfig = CONFIG.days.day3.front.matches[m];
            const course = CONFIG.courses[CONFIG.days.day3.course];

            for (let hole = 0; hole < 9; hole++) {
                const result = this.scores.day3.front[matchKey] ? this.scores.day3.front[matchKey][hole] : null;
                if (result === null || result === undefined) continue;

                if (result === 'hs') { hsTotalPts += 1; }
                else if (result === 'jd') { jdTotalPts += 1; }
                else { hsTotalPts += 0.5; jdTotalPts += 0.5; }
            }
        }

        // Bonus: winner of each match gets +1
        for (let m = 0; m < 2; m++) {
            const matchKey = `match${m + 1}`;
            let mHs = 0, mJd = 0;
            for (let hole = 0; hole < 9; hole++) {
                const result = this.scores.day3.front[matchKey] ? this.scores.day3.front[matchKey][hole] : null;
                if (result === 'hs') mHs += 1;
                else if (result === 'jd') mJd += 1;
                else if (result === 'halve') { mHs += 0.5; mJd += 0.5; }
            }
            if (mHs > mJd) hsTotalPts += 1;
            else if (mJd > mHs) jdTotalPts += 1;
            else { hsTotalPts += 0.5; jdTotalPts += 0.5; }
        }

        return { hsPoints: hsTotalPts, jdPoints: jdTotalPts };
    }

    // Day 3 Back: 1v1 match play
    calcDay3Back() {
        let hsTotalPts = 0, jdTotalPts = 0;

        for (let m = 0; m < 4; m++) {
            const matchKey = `match${m + 1}`;
            let mHs = 0, mJd = 0;

            for (let hole = 0; hole < 9; hole++) {
                const result = this.scores.day3.back[matchKey] ? this.scores.day3.back[matchKey][hole] : null;
                if (result === null || result === undefined) continue;

                if (result === 'hs') { hsTotalPts += 1; mHs += 1; }
                else if (result === 'jd') { jdTotalPts += 1; mJd += 1; }
                else { hsTotalPts += 0.5; jdTotalPts += 0.5; mHs += 0.5; mJd += 0.5; }
            }

            // Bonus: winner of each match gets +1
            if (mHs > mJd) hsTotalPts += 1;
            else if (mJd > mHs) jdTotalPts += 1;
            else { hsTotalPts += 0.5; jdTotalPts += 0.5; }
        }

        return { hsPoints: hsTotalPts, jdPoints: jdTotalPts };
    }

    getTournamentTotals() {
        const d1m1 = this.calcDay1Match('match1');
        const d1m2 = this.calcDay1Match('match2');
        const d1ind = this.calcDay1Individual();
        const d1hs = d1m1.hsPoints + d1m2.hsPoints + (d1ind.team === 'hs' ? 2 : (d1ind.team === 'jd' ? 0 : 1));
        const d1jd = d1m1.jdPoints + d1m2.jdPoints + (d1ind.team === 'jd' ? 2 : (d1ind.team === 'hs' ? 0 : 1));

        const d2 = this.calcDay2();
        const d3f = this.calcDay3Front();
        const d3b = this.calcDay3Back();

        return {
            day1: { hs: d1hs, jd: d1jd },
            day2: { hs: d2.hsPoints, jd: d2.jdPoints },
            day3: { hs: d3f.hsPoints + d3b.hsPoints, jd: d3f.jdPoints + d3b.jdPoints },
            total: {
                hs: d1hs + d2.hsPoints + d3f.hsPoints + d3b.hsPoints,
                jd: d1jd + d2.jdPoints + d3f.jdPoints + d3b.jdPoints
            }
        };
    }
}
