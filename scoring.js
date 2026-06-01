class TournamentScoring {
    constructor() {
        this.scores = this.loadScores();
    }

    loadScores() {
        const saved = localStorage.getItem('golf-tournament-2026');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (this.validateScores(parsed)) return parsed;
            } catch(e) {}
        }
        return this.getDefaultScores();
    }

    validateScores(data) {
        return data &&
            data.day1 && data.day1.match1 && data.day1.match2 &&
            data.day1.match1.hs && data.day1.match1.jd &&
            data.day2 && data.day2.hs && data.day2.jd &&
            data.day3 && data.day3.front && data.day3.back;
    }

    mergeWithDefaults(data) {
        const defaults = this.getDefaultScores();
        if (!data || !this.validateScores(data)) return defaults;
        return data;
    }

    getDefaultScores() {
        return {
            day1: {
                match1: { hs: this.emptyHoles(18), jd: this.emptyHoles(18) },
                match2: { hs: this.emptyHoles(18), jd: this.emptyHoles(18) }
            },
            day2: {
                hs: this.emptyHoles4(18),
                jd: this.emptyHoles4(18),
                junk: { hs: 0, jd: 0 }
            },
            day3: {
                front: {
                    match1: this.emptyHoles4(9),
                    match2: this.emptyHoles4(9)
                },
                back: {
                    match1: this.emptyHoles2(9),
                    match2: this.emptyHoles2(9),
                    match3: this.emptyHoles2(9),
                    match4: this.emptyHoles2(9)
                }
            }
        };
    }

    emptyHoles(n) {
        const arr = [];
        for (let i = 0; i < n; i++) arr.push([null, null]);
        return arr;
    }

    emptyHoles4(n) {
        const arr = [];
        for (let i = 0; i < n; i++) arr.push([null, null, null, null]);
        return arr;
    }

    emptyHoles2(n) {
        const arr = [];
        for (let i = 0; i < n; i++) arr.push([null, null]);
        return arr;
    }

    saveScores() {
        localStorage.setItem('golf-tournament-2026', JSON.stringify(this.scores));
        if (window.firebaseSave) {
            window.firebaseSave(this.scores);
        }
    }

    stablefordPoints(grossScore, par, strokesOnHole) {
        const netScore = grossScore - strokesOnHole;
        const diff = netScore - par;
        if (diff <= -3) return 5;
        if (diff === -2) return 4;
        if (diff === -1) return 3;
        if (diff === 0) return 2;
        if (diff === 1) return 1;
        return 0;
    }

    // ==================== DAY 1 ====================
    calcDay1Match(matchKey) {
        if (!this.scores.day1 || !this.scores.day1[matchKey]) return { hsPoints: 0, jdPoints: 0, holesPlayed: 0 };
        const match = matchKey === 'match1' ? CONFIG.days.day1.matches[0] : CONFIG.days.day1.matches[1];
        const course = CONFIG.courses[CONFIG.days.day1.course];
        let hsPoints = 0, jdPoints = 0, holesPlayed = 0;

        for (let hole = 0; hole < 18; hole++) {
            const scores = this.scores.day1[matchKey];
            const hsHole = scores.hs[hole];
            const jdHole = scores.jd[hole];

            if (!hsHole || !jdHole || hsHole[0] === null || hsHole[1] === null || jdHole[0] === null || jdHole[1] === null) continue;

            holesPlayed++;
            let hsStableford = 0, jdStableford = 0;

            for (let p = 0; p < 2; p++) {
                const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                const strokes = getStrokesOnHole(hcap, course.strokeIndex[hole]);
                hsStableford += this.stablefordPoints(hsHole[p], course.pars[hole], strokes);

                const hcapJ = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                const strokesJ = getStrokesOnHole(hcapJ, course.strokeIndex[hole]);
                jdStableford += this.stablefordPoints(jdHole[p], course.pars[hole], strokesJ);
            }

            if (hsStableford > jdStableford) hsPoints += 1;
            else if (jdStableford > hsStableford) jdPoints += 1;
            else { hsPoints += 0.5; jdPoints += 0.5; }
        }

        return { hsPoints, jdPoints, holesPlayed };
    }

    calcDay1Individual() {
        if (!this.scores.day1) return { player: null, total: 0, team: null };
        const rankings = this.calcDay1AllIndividuals();
        if (rankings.length === 0) return { player: null, total: 0, team: null };
        return { player: rankings[0].playerKey, total: rankings[0].total, team: rankings[0].team };
    }

    calcDay1AllIndividuals() {
        if (!this.scores.day1) return [];
        const course = CONFIG.courses[CONFIG.days.day1.course];
        const totals = [];

        for (const matchKey of ['match1', 'match2']) {
            if (!this.scores.day1[matchKey]) continue;
            const match = matchKey === 'match1' ? CONFIG.days.day1.matches[0] : CONFIG.days.day1.matches[1];
            const players = [...match.hs, ...match.jd];
            const teams = ['hs', 'hs', 'jd', 'jd'];

            for (let pIdx = 0; pIdx < 4; pIdx++) {
                const playerKey = players[pIdx];
                const team = teams[pIdx];
                const pInTeam = pIdx < 2 ? pIdx : pIdx - 2;
                let total = 0, holesPlayed = 0;

                for (let hole = 0; hole < 18; hole++) {
                    const scores = this.scores.day1[matchKey];
                    const teamScores = scores[team][hole];
                    if (!teamScores || teamScores[pInTeam] === null) continue;

                    holesPlayed++;
                    const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[hole]);
                    total += this.stablefordPoints(teamScores[pInTeam], course.pars[hole], strokes);
                }

                totals.push({ playerKey, team, total, holesPlayed });
            }
        }

        totals.sort((a, b) => b.total - a.total);
        return totals;
    }

    // ==================== DAY 2 ====================
    calcDay2() {
        if (!this.scores.day2 || !this.scores.day2.hs || !this.scores.day2.jd) return { hsPoints: 0, jdPoints: 0, hsFront: 0, jdFront: 0, hsBack: 0, jdBack: 0 };
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];

        // Get lowest course hcap in the entire group (off the low)
        const allPlayerKeys = [...hsPlayers, ...jdPlayers];
        const allHcaps = allPlayerKeys.map(p => getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance));
        const lowestHcap = Math.min(...allHcaps);

        let hsFront = 0, hsBack = 0, jdFront = 0, jdBack = 0;

        for (let hole = 0; hole < 18; hole++) {
            const hsHoleScores = this.scores.day2.hs[hole];
            const jdHoleScores = this.scores.day2.jd[hole];
            if (!hsHoleScores || !jdHoleScores) continue;
            if (hsHoleScores.every(v => v === null) || jdHoleScores.every(v => v === null)) continue;

            const par = course.pars[hole];
            const strokeIdx = course.strokeIndex[hole];

            const calcPlayer = (playerKey, gross) => {
                if (gross === null) return null;
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                const adjustedHcap = hcap - lowestHcap;
                const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
                return { gross, net: gross - strokes };
            };

            const hsCalc = hsPlayers.map((p, i) => calcPlayer(p, hsHoleScores[i])).filter(Boolean);
            const jdCalc = jdPlayers.map((p, i) => calcPlayer(p, jdHoleScores[i])).filter(Boolean);

            if (hsCalc.length < 2 || jdCalc.length < 2) continue;

            const bestCombo = (calcs) => {
                let bestTotal = 999;
                for (let i = 0; i < calcs.length; i++) {
                    for (let j = 0; j < calcs.length; j++) {
                        if (i === j) continue;
                        const total = (calcs[i].net - par) + (calcs[j].gross - par);
                        if (total < bestTotal) bestTotal = total;
                    }
                }
                return bestTotal;
            };

            const hsTotal = bestCombo(hsCalc);
            const jdTotal = bestCombo(jdCalc);

            if (hole < 9) { hsFront += hsTotal; jdFront += jdTotal; }
            else { hsBack += hsTotal; jdBack += jdTotal; }
        }

        const frontWinner = hsFront < jdFront ? 'hs' : (jdFront < hsFront ? 'jd' : 'tie');
        const backWinner = hsBack < jdBack ? 'hs' : (jdBack < hsBack ? 'jd' : 'tie');
        const overallWinner = (hsFront + hsBack) < (jdFront + jdBack) ? 'hs' : ((jdFront + jdBack) < (hsFront + hsBack) ? 'jd' : 'tie');

        let hsPoints = 0, jdPoints = 0;
        const s = CONFIG.days.day2.scoring;

        if (frontWinner === 'hs') hsPoints += s.front;
        else if (frontWinner === 'jd') jdPoints += s.front;
        else { hsPoints += s.front / 2; jdPoints += s.front / 2; }

        if (backWinner === 'hs') hsPoints += s.back;
        else if (backWinner === 'jd') jdPoints += s.back;
        else { hsPoints += s.back / 2; jdPoints += s.back / 2; }

        if (overallWinner === 'hs') hsPoints += s.overall;
        else if (overallWinner === 'jd') jdPoints += s.overall;
        else { hsPoints += s.overall / 2; jdPoints += s.overall / 2; }

        // Junk
        const junkHs = this.scores.day2.junk.hs || 0;
        const junkJd = this.scores.day2.junk.jd || 0;
        if (junkHs > junkJd) hsPoints += s.junk;
        else if (junkJd > junkHs) jdPoints += s.junk;
        else { hsPoints += s.junk / 2; jdPoints += s.junk / 2; }

        return { hsPoints, jdPoints, hsFront, jdFront, hsBack, jdBack };
    }

    // ==================== DAY 3 FRONT ====================
    calcDay3Front() {
        if (!this.scores.day3 || !this.scores.day3.front) return { hsPoints: 0, jdPoints: 0 };
        const course = CONFIG.courses[CONFIG.days.day3.course];
        let hsTotalPts = 0, jdTotalPts = 0;

        for (let m = 0; m < 2; m++) {
            const matchKey = `match${m + 1}`;
            const matchConfig = CONFIG.days.day3.front.matches[m];
            const allMatchPlayers = [...matchConfig.hs, ...matchConfig.jd];

            // Off the low in this match
            const matchHcaps = allMatchPlayers.map(p =>
                getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance));
            const lowestHcap = Math.min(...matchHcaps);

            let mHs = 0, mJd = 0;

            for (let hole = 0; hole < 9; hole++) {
                const holeScores = this.scores.day3.front[matchKey][hole];
                if (!holeScores || holeScores.every(v => v === null)) continue;

                const strokeIdx = course.strokeIndex[hole];

                // Calc net for each player off the low
                const nets = allMatchPlayers.map((p, i) => {
                    if (holeScores[i] === null) return null;
                    const hcap = getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
                    const adjustedHcap = hcap - lowestHcap;
                    const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
                    return holeScores[i] - strokes;
                });

                // Best ball: HS is players 0,1; JD is players 2,3
                const hsNets = [nets[0], nets[1]].filter(v => v !== null);
                const jdNets = [nets[2], nets[3]].filter(v => v !== null);

                if (hsNets.length === 0 || jdNets.length === 0) continue;

                const hsBest = Math.min(...hsNets);
                const jdBest = Math.min(...jdNets);

                if (hsBest < jdBest) { mHs += 1; }
                else if (jdBest < hsBest) { mJd += 1; }
                else { mHs += 0.5; mJd += 0.5; }
            }

            // Match bonus
            if (mHs > mJd) mHs += 1;
            else if (mJd > mHs) mJd += 1;
            else { mHs += 0.5; mJd += 0.5; }

            hsTotalPts += mHs;
            jdTotalPts += mJd;
        }

        return { hsPoints: hsTotalPts, jdPoints: jdTotalPts };
    }

    // ==================== DAY 3 BACK ====================
    calcDay3Back() {
        if (!this.scores.day3 || !this.scores.day3.back) return { hsPoints: 0, jdPoints: 0 };
        const course = CONFIG.courses[CONFIG.days.day3.course];
        let hsTotalPts = 0, jdTotalPts = 0;

        for (let m = 0; m < 4; m++) {
            const matchKey = `match${m + 1}`;
            const matchConfig = CONFIG.days.day3.back.matches[m];
            const hsPlayer = matchConfig.hs;
            const jdPlayer = matchConfig.jd;

            // Strokes = difference, applied to back 9 (holes 9-17 in the array)
            const hsHcap = getPlayerCourseHcap(hsPlayer, CONFIG.days.day3.course, 1.0);
            const jdHcap = getPlayerCourseHcap(jdPlayer, CONFIG.days.day3.course, 1.0);
            const diff = Math.abs(hsHcap - jdHcap);
            const hsGetsStrokes = hsHcap > jdHcap;

            let mHs = 0, mJd = 0;

            for (let hole = 0; hole < 9; hole++) {
                const holeScores = this.scores.day3.back[matchKey][hole];
                if (!holeScores || holeScores[0] === null || holeScores[1] === null) continue;

                const courseHoleIdx = hole + 9; // back 9 holes
                const strokeIdx = course.strokeIndex[courseHoleIdx];

                // Strokes on this hole based on diff
                const strokes = getStrokesOnHole(diff, strokeIdx);
                let hsNet = holeScores[0];
                let jdNet = holeScores[1];

                if (hsGetsStrokes) hsNet -= strokes;
                else jdNet -= strokes;

                if (hsNet < jdNet) mHs += 1;
                else if (jdNet < hsNet) mJd += 1;
                else { mHs += 0.5; mJd += 0.5; }
            }

            // Match bonus
            if (mHs > mJd) mHs += 1;
            else if (mJd > mHs) mJd += 1;
            else { mHs += 0.5; mJd += 0.5; }

            hsTotalPts += mHs;
            jdTotalPts += mJd;
        }

        return { hsPoints: hsTotalPts, jdPoints: jdTotalPts };
    }

    // Helper to get hole result for Day 3 front (for display)
    getDay3FrontHoleResult(matchIdx, hole) {
        const course = CONFIG.courses[CONFIG.days.day3.course];
        const matchKey = `match${matchIdx + 1}`;
        const matchConfig = CONFIG.days.day3.front.matches[matchIdx];
        const allMatchPlayers = [...matchConfig.hs, ...matchConfig.jd];

        const matchHcaps = allMatchPlayers.map(p =>
            getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance));
        const lowestHcap = Math.min(...matchHcaps);

        const holeScores = this.scores.day3.front[matchKey][hole];
        if (!holeScores || holeScores.every(v => v === null)) return null;

        const strokeIdx = course.strokeIndex[hole];
        const nets = allMatchPlayers.map((p, i) => {
            if (holeScores[i] === null) return null;
            const hcap = getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            return holeScores[i] - strokes;
        });

        const hsNets = [nets[0], nets[1]].filter(v => v !== null);
        const jdNets = [nets[2], nets[3]].filter(v => v !== null);
        if (hsNets.length === 0 || jdNets.length === 0) return null;

        const hsBest = Math.min(...hsNets);
        const jdBest = Math.min(...jdNets);

        if (hsBest < jdBest) return 'hs';
        if (jdBest < hsBest) return 'jd';
        return 'halve';
    }

    // Helper to get hole result for Day 3 back (for display)
    getDay3BackHoleResult(matchIdx, hole) {
        const course = CONFIG.courses[CONFIG.days.day3.course];
        const matchKey = `match${matchIdx + 1}`;
        const matchConfig = CONFIG.days.day3.back.matches[matchIdx];
        const hsPlayer = matchConfig.hs;
        const jdPlayer = matchConfig.jd;

        const hsHcap = getPlayerCourseHcap(hsPlayer, CONFIG.days.day3.course, 1.0);
        const jdHcap = getPlayerCourseHcap(jdPlayer, CONFIG.days.day3.course, 1.0);
        const diff = Math.abs(hsHcap - jdHcap);
        const hsGetsStrokes = hsHcap > jdHcap;

        const holeScores = this.scores.day3.back[matchKey][hole];
        if (!holeScores || holeScores[0] === null || holeScores[1] === null) return null;

        const courseHoleIdx = hole + 9;
        const strokeIdx = course.strokeIndex[courseHoleIdx];
        const strokes = getStrokesOnHole(diff, strokeIdx);

        let hsNet = holeScores[0];
        let jdNet = holeScores[1];
        if (hsGetsStrokes) hsNet -= strokes;
        else jdNet -= strokes;

        if (hsNet < jdNet) return 'hs';
        if (jdNet < hsNet) return 'jd';
        return 'halve';
    }

    getTournamentTotals() {
        const d1m1 = this.calcDay1Match('match1');
        const d1m2 = this.calcDay1Match('match2');
        const d1ind = this.calcDay1Individual();

        let d1hs = d1m1.hsPoints + d1m2.hsPoints;
        let d1jd = d1m1.jdPoints + d1m2.jdPoints;
        if (d1ind.player) {
            if (d1ind.team === 'hs') d1hs += 2;
            else if (d1ind.team === 'jd') d1jd += 2;
        }

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
