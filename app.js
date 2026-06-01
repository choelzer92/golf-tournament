document.addEventListener('DOMContentLoaded', () => {
    applyPairings();
    const scoring = new TournamentScoring();
    window.tournamentScoring = scoring;
    let scorerMode = false;
    let currentHole = { day1m1: 0, day1m2: 0, day2: 0, day3f1: 0, day3f2: 0, day3b1: 0, day3b2: 0, day3b3: 0, day3b4: 0 };

    const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.view).classList.add('active');
            if (btn.dataset.view === 'pairings') renderPairingsPage();
        });
    });

    // Scorer mode toggle
    document.getElementById('toggle-scorer-btn').addEventListener('click', () => {
        scorerMode = !scorerMode;
        document.getElementById('toggle-scorer-btn').classList.toggle('active', scorerMode);
        document.getElementById('toggle-scorer-btn').textContent = scorerMode ? 'View Mode' : 'Scorer Mode';
        renderAll();
    });

    function renderAll() {
        try {
            updateMatchHeaders();
            renderLeaderboard();
            renderDay1();
            renderDay2();
            renderDay3();
        } catch(e) {
            console.error('Render error:', e);
        }
    }

    function renderLeaderboard() {
        const totals = scoring.getTournamentTotals();
        const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));
        document.getElementById('hs-total').textContent = fmt(totals.total.hs);
        document.getElementById('jd-total').textContent = fmt(totals.total.jd);
        document.getElementById('hs-d1').textContent = fmt(totals.day1.hs);
        document.getElementById('jd-d1').textContent = fmt(totals.day1.jd);
        document.getElementById('hs-d2').textContent = fmt(totals.day2.hs);
        document.getElementById('jd-d2').textContent = fmt(totals.day2.jd);
        document.getElementById('hs-d3').textContent = fmt(totals.day3.hs);
        document.getElementById('jd-d3').textContent = fmt(totals.day3.jd);

        // Bonus leaders
        let bonusHtml = '';

        // Day 1 match bonuses
        const d1m1 = scoring.calcDay1Match('match1');
        const d1m2 = scoring.calcDay1Match('match2');
        if (d1m1.holesPlayed > 0) {
            const winner = d1m1.hsPoints > d1m2.hsPoints ? 'HS' : (d1m1.jdPoints > d1m1.hsPoints ? 'JD' : null);
            // Match bonus is baked into hsPoints/jdPoints, show who's winning
            const m1lead = d1m1.hsPoints > d1m1.jdPoints ? 'hs' : (d1m1.jdPoints > d1m1.hsPoints ? 'jd' : 'tie');
            const m1cls = m1lead === 'hs' ? 'hs-pts' : (m1lead === 'jd' ? 'jd-pts' : '');
            const m1txt = m1lead === 'tie' ? 'Tied' : (m1lead === 'hs' ? 'HS leads' : 'JD leads');
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D1 Match 1:</span> <span class="${m1cls}"><b>${d1m1.hsPoints}</b> - <b>${d1m1.jdPoints}</b> (${m1txt})</span></div>`;
        }
        if (d1m2.holesPlayed > 0) {
            const m2lead = d1m2.hsPoints > d1m2.jdPoints ? 'hs' : (d1m2.jdPoints > d1m2.hsPoints ? 'jd' : 'tie');
            const m2cls = m2lead === 'hs' ? 'hs-pts' : (m2lead === 'jd' ? 'jd-pts' : '');
            const m2txt = m2lead === 'tie' ? 'Tied' : (m2lead === 'hs' ? 'HS leads' : 'JD leads');
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D1 Match 2:</span> <span class="${m2cls}"><b>${d1m2.hsPoints}</b> - <b>${d1m2.jdPoints}</b> (${m2txt})</span></div>`;
        }

        // Day 1 individual stableford bonus
        const d1ind = scoring.calcDay1Individual();
        if (d1ind.winners.length > 0) {
            const names = d1ind.winners.map(w => allPlayers[w.playerKey].name.split(' ').pop()).join(', ');
            const teamCls = d1ind.winners.every(w => w.team === 'hs') ? 'hs-pts' : (d1ind.winners.every(w => w.team === 'jd') ? 'jd-pts' : '');
            const pts = d1ind.winners.length > 1 ? `${parseFloat((2 / d1ind.winners.length).toFixed(2))} pts each` : '2 pts';
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D1 Best Stableford:</span> <span class="${teamCls}"><b>${names}</b> (${d1ind.total} pts) — ${pts}</span></div>`;
        }

        // Day 2 hole-by-hole results
        const d2 = scoring.calcDay2();
        if (d2.holesPlayed > 0) {
            const lead = d2.hsPoints > d2.jdPoints ? 'hs' : (d2.jdPoints > d2.hsPoints ? 'jd' : 'tie');
            const cls = lead === 'hs' ? 'hs-pts' : (lead === 'jd' ? 'jd-pts' : '');
            const txt = lead === 'tie' ? 'Tied' : (lead === 'hs' ? 'HS leads' : 'JD leads');
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D2 Holes (${d2.holesPlayed}/18):</span> <span class="${cls}"><b>${d2.hsPoints}</b> - <b>${d2.jdPoints}</b> (${txt})</span></div>`;
        }

        // Day 2 junk
        if (d2.junkHs > 0 || d2.junkJd > 0) {
            const jWin = d2.junkHs > d2.junkJd ? 'hs' : (d2.junkJd > d2.junkHs ? 'jd' : 'tie');
            const jCls = jWin === 'hs' ? 'hs-pts' : (jWin === 'jd' ? 'jd-pts' : '');
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D2 Junk:</span> <span class="${jCls}">HS: ${d2.junkHs} | JD: ${d2.junkJd}</span></div>`;
        }

        // Day 2 individual net bonus
        const d2ind = scoring.calcDay2Individual();
        if (d2ind.winners.length > 0) {
            const names = d2ind.winners.map(w => allPlayers[w.playerKey].name.split(' ').pop()).join(', ');
            const teamCls = d2ind.winners.every(w => w.team === 'hs') ? 'hs-pts' : (d2ind.winners.every(w => w.team === 'jd') ? 'jd-pts' : '');
            const pts = d2ind.winners.length > 1 ? `${parseFloat((2 / d2ind.winners.length).toFixed(2))} pts each` : '2 pts';
            bonusHtml += `<div class="bonus-leader-row"><span class="bonus-label">D2 Best Net:</span> <span class="${teamCls}"><b>${names}</b> (${d2ind.total} net) — ${pts}</span></div>`;
        }

        document.getElementById('leaderboard-bonuses').innerHTML = bonusHtml;
    }

    // ==================== SHARED HELPERS ====================
    function renderScoreButtons(dataAttrs, currentVal, par) {
        let html = '';
        for (let s = Math.max(1, par - 3); s <= par + 4; s++) {
            const diff = s - par;
            let cls = 'score-btn';
            if (diff <= -2) cls += ' eagle-btn';
            else if (diff === -1) cls += ' birdie-btn';
            else if (diff === 0) cls += ' par-btn';
            else if (diff === 1) cls += ' bogey-btn';
            else cls += ' dbl-btn';
            if (currentVal === s) cls += ' selected';
            html += `<button class="${cls}" ${dataAttrs} data-score="${s}">${s}</button>`;
        }
        return html;
    }

    function renderHoleNav(holeKey, hole, maxHole) {
        let html = `<div class="hole-nav">
            <button class="hole-nav-btn prev" data-key="${holeKey}" ${hole === 0 ? 'disabled' : ''}>&lt;</button>
            <div class="hole-info">
                <span class="hole-number">Hole ${hole + 1}</span>
            </div>
            <button class="hole-nav-btn next" data-key="${holeKey}" ${hole === maxHole ? 'disabled' : ''}>&gt;</button>
        </div>`;
        return html;
    }

    function renderDots(holeKey, total, currentIdx, checkFilled) {
        let html = '<div class="hole-dots">';
        for (let h = 0; h < total; h++) {
            const filled = checkFilled(h);
            html += `<span class="dot ${filled ? 'filled' : ''} ${h === currentIdx ? 'current' : ''}" data-key="${holeKey}" data-hole="${h}"></span>`;
        }
        html += '</div>';
        return html;
    }

    function attachNavEvents(holeKey, maxHole) {
        document.querySelectorAll(`.hole-nav-btn[data-key="${holeKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('prev') && currentHole[holeKey] > 0) currentHole[holeKey]--;
                if (e.target.classList.contains('next') && currentHole[holeKey] < maxHole) currentHole[holeKey]++;
                renderAll();
            });
        });
        document.querySelectorAll(`.dot[data-key="${holeKey}"]`).forEach(dot => {
            dot.addEventListener('click', (e) => {
                currentHole[holeKey] = parseInt(e.target.dataset.hole);
                renderAll();
            });
        });
    }

    // Collapsible match state
    const expandedMatch = { day1: null, day2: null, day3: null };

    function setupCollapsibleMatches(dayKey, matchEls) {
        if (!scorerMode) {
            matchEls.forEach(el => {
                el.classList.remove('collapsed');
                el.querySelector('.scorecard-container').style.display = '';
            });
            return;
        }
        matchEls.forEach((el, idx) => {
            const isExpanded = expandedMatch[dayKey] === idx;
            el.classList.toggle('collapsed', !isExpanded);
            el.querySelector('.scorecard-container').style.display = isExpanded ? '' : 'none';

            const header = el.querySelector('h3, h4');
            if (header && !header.dataset.collapsible) {
                header.dataset.collapsible = 'true';
                header.style.cursor = 'pointer';
                header.addEventListener('click', () => {
                    expandedMatch[dayKey] = expandedMatch[dayKey] === idx ? null : idx;
                    renderAll();
                });
            }
        });
    }

    // ==================== DAY 1 ====================
    function renderDay1() {
        for (const matchIdx of [1, 2]) {
            const matchKey = `match${matchIdx}`;
            const holeKey = `day1m${matchIdx}`;
            const matchEl = document.getElementById(`d1-${matchKey}`);
            const container = matchEl.querySelector('.scorecard-container');
            const match = CONFIG.days.day1.matches[matchIdx - 1];
            const course = CONFIG.courses[CONFIG.days.day1.course];

            if (scorerMode) {
                container.innerHTML = renderDay1Scorer(matchKey, holeKey, match, course);
                attachDay1Events(matchKey, holeKey, match, course);
            } else {
                container.innerHTML = renderDay1View(matchKey, match, course);
            }
        }

        setupCollapsibleMatches('day1', [
            document.getElementById('d1-match1'),
            document.getElementById('d1-match2')
        ]);

        const rankings = scoring.calcDay1AllIndividuals();
        let indHtml = '';
        if (rankings.length > 0 && rankings[0].holesPlayed > 0) {
            const topTotal = rankings[0].total;
            indHtml = '<div class="individual-rankings">';
            rankings.forEach((r, idx) => {
                const name = allPlayers[r.playerKey].name;
                const cls = r.team === 'hs' ? 'hs-pts' : 'jd-pts';
                const leader = r.total === topTotal ? ' leader' : '';
                indHtml += `<div class="ind-row${leader}">
                    <span class="ind-rank">${idx + 1}.</span>
                    <span class="ind-name ${cls}">${name}</span>
                    <span class="ind-holes">${r.holesPlayed}h</span>
                    <span class="ind-total ${cls}"><b>${r.total}</b> pts</span>
                </div>`;
            });
            indHtml += '</div>';
        } else {
            indHtml = 'No scores yet';
        }
        document.getElementById('d1-individual-leader').innerHTML = indHtml;
    }

    function renderDay1Scorer(matchKey, holeKey, match, course) {
        const hole = currentHole[holeKey];
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const scores = scoring.scores.day1[matchKey];
        const hsHole = scores.hs[hole] || [null, null];
        const jdHole = scores.jd[hole] || [null, null];

        let html = renderHoleNav(holeKey, hole, 17);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx}</div>`;
        html += renderDots(holeKey, 18, hole, (h) => {
            return scores.hs[h] && scores.jd[h] && scores.hs[h][0] !== null && scores.hs[h][1] !== null && scores.jd[h][0] !== null && scores.jd[h][1] !== null;
        });

        html += '<div class="player-scores">';

        // HS
        html += '<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = match.hs[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            const currentVal = hsHole[p];
            const stableford = currentVal !== null ? scoring.stablefordPoints(currentVal, par, strokes) : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + ' stroke' + (strokes > 1 ? 's' : '') + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="1" data-match="${matchKey}" data-team="hs" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${stableford !== null ? `<div class="stableford-result visible">${stableford} stableford pts</div>` : ''}
            </div>`;
        }
        html += '</div>';

        // JD
        html += '<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = match.jd[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            const currentVal = jdHole[p];
            const stableford = currentVal !== null ? scoring.stablefordPoints(currentVal, par, strokes) : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + ' stroke' + (strokes > 1 ? 's' : '') + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="1" data-match="${matchKey}" data-team="jd" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${stableford !== null ? `<div class="stableford-result visible">${stableford} stableford pts</div>` : ''}
            </div>`;
        }
        html += '</div></div>';

        // Hole result
        if (hsHole[0] !== null && hsHole[1] !== null && jdHole[0] !== null && jdHole[1] !== null) {
            let hsS = 0, jdS = 0;
            for (let p = 0; p < 2; p++) {
                hsS += scoring.stablefordPoints(hsHole[p], par, getStrokesOnHole(getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), strokeIdx));
                jdS += scoring.stablefordPoints(jdHole[p], par, getStrokesOnHole(getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), strokeIdx));
            }
            let cls = 'halve-result', txt = `Halved ${hsS} - ${jdS}`;
            if (hsS > jdS) { cls = 'hs-result'; txt = `HS wins ${hsS} - ${jdS}`; }
            else if (jdS > hsS) { cls = 'jd-result'; txt = `JD wins ${jdS} - ${hsS}`; }
            html += `<div class="hole-result ${cls}">${txt}</div>`;
        }

        const matchResult = scoring.calcDay1Match(matchKey);
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${matchResult.hsPoints}</span>
            <span>${matchResult.holesPlayed}/18</span>
            <span class="jd-pts">JD: ${matchResult.jdPoints}</span>
        </div>`;

        return html;
    }

    function attachDay1Events(matchKey, holeKey, match, course) {
        document.querySelectorAll(`.score-btn[data-day="1"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);
                if (!scoring.scores.day1[matchKey][team][hole]) scoring.scores.day1[matchKey][team][hole] = [null, null];
                scoring.scores.day1[matchKey][team][hole][player] = scoring.scores.day1[matchKey][team][hole][player] === score ? null : score;
                scoring.saveScores();
                renderAll();
            });
        });
        attachNavEvents(holeKey, 17);
    }

    function renderDay1View(matchKey, match, course) {
        const matchResult = scoring.calcDay1Match(matchKey);
        let html = '<div class="summary-holes">';
        for (let h = 0; h < 18; h++) {
            const scores = scoring.scores.day1[matchKey];
            let cls = 'summary-hole';
            if (scores.hs[h] && scores.jd[h] && scores.hs[h][0] !== null && scores.hs[h][1] !== null && scores.jd[h][0] !== null && scores.jd[h][1] !== null) {
                let hsS = 0, jdS = 0;
                for (let p = 0; p < 2; p++) {
                    hsS += scoring.stablefordPoints(scores.hs[h][p], course.pars[h], getStrokesOnHole(getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), course.strokeIndex[h]));
                    jdS += scoring.stablefordPoints(scores.jd[h][p], course.pars[h], getStrokesOnHole(getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), course.strokeIndex[h]));
                }
                if (hsS > jdS) cls += ' hs-win';
                else if (jdS > hsS) cls += ' jd-win';
                else cls += ' halved';
            }
            html += `<div class="${cls}">${h + 1}</div>`;
        }
        html += '</div>';
        html += `<div class="match-status"><span class="hs-pts">HS: ${matchResult.hsPoints}</span><span>${matchResult.holesPlayed}/18</span><span class="jd-pts">JD: ${matchResult.jdPoints}</span></div>`;
        return html;
    }

    // ==================== DAY 2 ====================
    function renderDay2() {
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];

        if (scorerMode) {
            document.getElementById('d2-team').style.display = 'none';
            document.getElementById('d2-hs').style.display = '';
            document.getElementById('d2-jd').style.display = '';

            const hsContainer = document.querySelector('#d2-hs .scorecard-container');
            const jdContainer = document.querySelector('#d2-jd .scorecard-container');
            hsContainer.innerHTML = renderDay2TeamScorer(course, hsPlayers, 'hs');
            jdContainer.innerHTML = renderDay2TeamScorer(course, jdPlayers, 'jd');
            attachDay2Events(course, hsPlayers, jdPlayers);

            setupCollapsibleMatches('day2', [
                document.getElementById('d2-hs'),
                document.getElementById('d2-jd')
            ]);
        } else {
            document.getElementById('d2-team').style.display = '';
            document.getElementById('d2-hs').style.display = 'none';
            document.getElementById('d2-jd').style.display = 'none';
            const container = document.getElementById('d2-full-container');
            container.innerHTML = renderDay2View(course, hsPlayers, jdPlayers);
        }

        // Junk - auto-calculated
        const junk = scoring.calcDay2Junk();
        document.getElementById('d2-junk-hs').innerHTML = `<span class="junk-total">${junk.hs}</span><span class="junk-detail">${junk.hsDetail.birdies}B ${junk.hsDetail.eagles}E ${junk.hsDetail.groupHugs}GH</span>`;
        document.getElementById('d2-junk-jd').innerHTML = `<span class="junk-total">${junk.jd}</span><span class="junk-detail">${junk.jdDetail.birdies}B ${junk.jdDetail.eagles}E ${junk.jdDetail.groupHugs}GH</span>`;

        // Individual net bonus
        const d2ind = scoring.calcDay2Individual();
        let indHtml = '';
        if (d2ind.winners.length > 0) {
            indHtml = '<div class="individual-rankings">';
            const allRankPlayers = [...hsPlayers, ...jdPlayers];
            const allHcaps2 = allRankPlayers.map(p => getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance));
            const lowestH = Math.min(...allHcaps2);

            // Build full rankings for display
            const rankings = [];
            for (let t = 0; t < 2; t++) {
                const teamPlayers = t === 0 ? hsPlayers : jdPlayers;
                const team = t === 0 ? 'hs' : 'jd';
                for (let p = 0; p < 4; p++) {
                    const pk = teamPlayers[p];
                    let netTotal = 0, holesPlayed = 0;
                    for (let h = 0; h < 18; h++) {
                        const holeScores = scoring.scores.day2[team][h];
                        if (!holeScores || holeScores[p] === null) continue;
                        holesPlayed++;
                        const hcap = getPlayerCourseHcap(pk, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                        const adj = hcap - lowestH;
                        const strokes = getStrokesOnHole(adj, course.strokeIndex[h]);
                        netTotal += holeScores[p] - strokes;
                    }
                    rankings.push({ playerKey: pk, team, netTotal, holesPlayed });
                }
            }
            rankings.sort((a, b) => a.netTotal - b.netTotal);
            const topNet = rankings[0].netTotal;

            rankings.forEach((r, idx) => {
                if (r.holesPlayed === 0) return;
                const name = allPlayers[r.playerKey].name;
                const cls = r.team === 'hs' ? 'hs-pts' : 'jd-pts';
                const leader = r.netTotal === topNet ? ' leader' : '';
                indHtml += `<div class="ind-row${leader}">
                    <span class="ind-rank">${idx + 1}.</span>
                    <span class="ind-name ${cls}">${name}</span>
                    <span class="ind-holes">${r.holesPlayed}h</span>
                    <span class="ind-total ${cls}"><b>${r.netTotal}</b> net</span>
                </div>`;
            });
            indHtml += '</div>';
        } else {
            indHtml = 'No scores yet';
        }
        document.getElementById('d2-individual-leader').innerHTML = indHtml;
    }

    function renderDay2Scorer(course, hsPlayers, jdPlayers) {
        const hole = currentHole.day2;
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const hsHole = scoring.scores.day2.hs[hole] || [null, null, null, null];
        const jdHole = scoring.scores.day2.jd[hole] || [null, null, null, null];

        // Off the low
        const allPKeys = [...hsPlayers, ...jdPlayers];
        const allHcaps = allPKeys.map(p => getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance));
        const lowestHcap = Math.min(...allHcaps);

        let html = renderHoleNav('day2', hole, 17);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx}</div>`;
        html += renderDots('day2', 18, hole, (h) => {
            const hs = scoring.scores.day2.hs[h];
            const jd = scoring.scores.day2.jd[h];
            return hs && jd && hs.some(v => v !== null) && jd.some(v => v !== null);
        });

        html += '<div class="player-scores">';

        // HS
        html += '<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>';
        for (let p = 0; p < 4; p++) {
            const playerKey = hsPlayers[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            const currentVal = hsHole[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} (${adjustedHcap} off low)${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="2" data-team="hs" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Gross: ${currentVal} | Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div>';

        // JD
        html += '<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>';
        for (let p = 0; p < 4; p++) {
            const playerKey = jdPlayers[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            const currentVal = jdHole[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} (${adjustedHcap} off low)${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="2" data-team="jd" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Gross: ${currentVal} | Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div></div>';

        // Running total
        const d2 = scoring.calcDay2();
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${d2.hsPoints}</span>
            <span>${d2.holesPlayed}/18 holes</span>
            <span class="jd-pts">JD: ${d2.jdPoints}</span>
        </div>`;

        return html;
    }

    function renderDay2TeamScorer(course, teamPlayers, teamKey) {
        const hole = currentHole.day2;
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const holeScores = scoring.scores.day2[teamKey][hole] || [null, null, null, null];

        const allPKeys = ['bodner', 'burns', 'smith', 'ross', 'craig', 'casey', 'enterlin', 'lacy'];
        const allHcaps = allPKeys.map(p => getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance));
        const lowestHcap = Math.min(...allHcaps);

        let html = renderHoleNav('day2', hole, 17);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx}</div>`;
        html += renderDots('day2', 18, hole, (h) => {
            const s = scoring.scores.day2[teamKey][h];
            return s && s.some(v => v !== null);
        });

        html += '<div class="player-scores">';
        for (let p = 0; p < 4; p++) {
            const playerKey = teamPlayers[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            const currentVal = holeScores[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} (${adjustedHcap} off low)${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="2" data-team="${teamKey}" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Gross: ${currentVal} | Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div>';

        const d2 = scoring.calcDay2();
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${d2.hsPoints}</span>
            <span>${d2.holesPlayed}/18 holes</span>
            <span class="jd-pts">JD: ${d2.jdPoints}</span>
        </div>`;

        return html;
    }

    function attachDay2Events(course, hsPlayers, jdPlayers) {
        document.querySelectorAll('.score-btn[data-day="2"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);
                if (!scoring.scores.day2[team][hole]) scoring.scores.day2[team][hole] = [null, null, null, null];
                scoring.scores.day2[team][hole][player] = scoring.scores.day2[team][hole][player] === score ? null : score;
                scoring.saveScores();
                renderAll();
            });
        });
        attachNavEvents('day2', 17);
    }

    function renderDay2View(course, hsPlayers, jdPlayers) {
        const d2 = scoring.calcDay2();
        const s2 = CONFIG.days.day2.scoring;
        let html = '<div class="summary-holes">';
        for (let h = 0; h < 18; h++) {
            const hs = scoring.scores.day2.hs[h];
            const jd = scoring.scores.day2.jd[h];
            let cls = 'summary-hole';
            if (hs && jd && hs.some(v => v !== null) && jd.some(v => v !== null)) cls += ' filled';
            html += `<div class="${cls}">${h + 1}</div>`;
        }
        html += '</div>';
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${d2.hsPoints}</span>
            <span>${d2.holesPlayed}/18 holes</span>
            <span class="jd-pts">JD: ${d2.jdPoints}</span>
        </div>`;
        return html;
    }

    // ==================== DAY 3 ====================
    function renderDay3() {
        const course = CONFIG.courses[CONFIG.days.day3.course];

        if (scorerMode) {
            // Unified scorer: 2 groups, 18 holes each, 4 players per group
            for (let m = 0; m < 2; m++) {
                const matchEl = document.getElementById(`d3-front-match${m + 1}`);
                const container = matchEl.querySelector('.scorecard-container');
                const matchConfig = CONFIG.days.day3.front.matches[m];
                const matchKey = `match${m + 1}`;
                const holeKey = `day3f${m + 1}`;
                container.innerHTML = renderDay3GroupScorer(m, matchKey, holeKey, matchConfig, course);
                attachDay3GroupEvents(m, matchKey, holeKey, matchConfig, course);
            }
            // Hide back 9 match containers and all nine-headers in scorer mode
            for (let m = 0; m < 4; m++) {
                const matchEl = document.getElementById(`d3-back-match${m + 1}`);
                if (matchEl) matchEl.style.display = 'none';
            }
            document.querySelectorAll('#day3 .nine-header').forEach(el => el.style.display = 'none');

            setupCollapsibleMatches('day3', [
                document.getElementById('d3-front-match1'),
                document.getElementById('d3-front-match2')
            ]);
        } else {
            // View mode: show front and back separately as before
            for (let m = 0; m < 2; m++) {
                const matchEl = document.getElementById(`d3-front-match${m + 1}`);
                const container = matchEl.querySelector('.scorecard-container');
                const matchKey = `match${m + 1}`;
                const matchConfig = CONFIG.days.day3.front.matches[m];
                container.innerHTML = renderDay3FrontView(m, matchKey, matchConfig, course);
            }
            for (let m = 0; m < 4; m++) {
                const matchEl = document.getElementById(`d3-back-match${m + 1}`);
                if (matchEl) matchEl.style.display = '';
                const container = matchEl.querySelector('.scorecard-container');
                const matchKey = `match${m + 1}`;
                const matchConfig = CONFIG.days.day3.back.matches[m];
                container.innerHTML = renderDay3BackView(m, matchKey, matchConfig, course);
            }
            document.querySelectorAll('#day3 .nine-header').forEach(el => el.style.display = '');
        }
    }

    function renderDay3GroupScorer(matchIdx, matchKey, holeKey, matchConfig, course) {
        const hole = currentHole[holeKey];
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];

        // Determine which data to use based on front/back
        const isFront = hole < 9;
        let holeScores;
        if (isFront) {
            holeScores = scoring.scores.day3.front[matchKey][hole] || [null, null, null, null];
        } else {
            // Back 9: reconstruct from back match data
            const backHole = hole - 9;
            const backMatch1Key = `match${matchIdx * 2 + 1}`;
            const backMatch2Key = `match${matchIdx * 2 + 2}`;
            const bm1 = scoring.scores.day3.back[backMatch1Key][backHole] || [null, null];
            const bm2 = scoring.scores.day3.back[backMatch2Key][backHole] || [null, null];
            holeScores = [bm1[0], bm2[0], bm1[1], bm2[1]];
        }

        // Handicap info for display
        const allMatchPlayers = [...matchConfig.hs, ...matchConfig.jd];
        const frontHcaps = allMatchPlayers.map(p => getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance));
        const lowestFrontHcap = Math.min(...frontHcaps);

        let html = renderHoleNav(holeKey, hole, 17);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx} | ${isFront ? 'Front 9 (Best Ball)' : 'Back 9 (1v1)'}</div>`;
        html += renderDots(holeKey, 18, hole, (h) => {
            if (h < 9) {
                const s = scoring.scores.day3.front[matchKey][h];
                return s && s.some(v => v !== null);
            } else {
                const bh = h - 9;
                const bk1 = `match${matchIdx * 2 + 1}`;
                const bk2 = `match${matchIdx * 2 + 2}`;
                const s1 = scoring.scores.day3.back[bk1][bh];
                const s2 = scoring.scores.day3.back[bk2][bh];
                return (s1 && s1.some(v => v !== null)) || (s2 && s2.some(v => v !== null));
            }
        });

        html += '<div class="player-scores">';

        // HS players
        html += '<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = matchConfig.hs[p];
            let hcapDisplay, strokesDisplay;
            if (isFront) {
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
                const adj = hcap - lowestFrontHcap;
                const strokes = getStrokesOnHole(adj, strokeIdx);
                hcapDisplay = `${adj} off low`;
                strokesDisplay = strokes;
            } else {
                const hsHcap = getPlayerCourseHcap(matchConfig.hs[p], CONFIG.days.day3.course, 1.0);
                const jdHcap = getPlayerCourseHcap(matchConfig.jd[p], CONFIG.days.day3.course, 1.0);
                const diff = Math.abs(hsHcap - jdHcap);
                const hsGetsStrokes = hsHcap > jdHcap;
                const strokes = hsGetsStrokes ? getStrokesOnHole(diff, strokeIdx) : 0;
                hcapDisplay = `${hsHcap} hcp`;
                strokesDisplay = strokes;
            }
            const currentVal = holeScores[p];
            const netScore = currentVal !== null ? currentVal - strokesDisplay : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcapDisplay}${strokesDisplay > 0 ? ' | <b class="stroke-dot">+' + strokesDisplay + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3g" data-match="${matchKey}" data-group="${matchIdx}" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div>';

        // JD players
        html += '<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = matchConfig.jd[p];
            let hcapDisplay, strokesDisplay;
            if (isFront) {
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
                const adj = hcap - lowestFrontHcap;
                const strokes = getStrokesOnHole(adj, strokeIdx);
                hcapDisplay = `${adj} off low`;
                strokesDisplay = strokes;
            } else {
                const jdHcap = getPlayerCourseHcap(matchConfig.jd[p], CONFIG.days.day3.course, 1.0);
                const hsHcap = getPlayerCourseHcap(matchConfig.hs[p], CONFIG.days.day3.course, 1.0);
                const diff = Math.abs(hsHcap - jdHcap);
                const jdGetsStrokes = jdHcap > hsHcap;
                const strokes = jdGetsStrokes ? getStrokesOnHole(diff, strokeIdx) : 0;
                hcapDisplay = `${jdHcap} hcp`;
                strokesDisplay = strokes;
            }
            const currentVal = holeScores[p + 2];
            const netScore = currentVal !== null ? currentVal - strokesDisplay : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcapDisplay}${strokesDisplay > 0 ? ' | <b class="stroke-dot">+' + strokesDisplay + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3g" data-match="${matchKey}" data-group="${matchIdx}" data-hole="${hole}" data-player="${p + 2}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div></div>';

        // Hole result
        if (isFront) {
            const result = scoring.getDay3FrontHoleResult(matchIdx, hole);
            if (result) {
                let cls = 'halve-result', txt = 'Halved';
                if (result === 'hs') { cls = 'hs-result'; txt = 'Hog Suckers win hole'; }
                else if (result === 'jd') { cls = 'jd-result'; txt = 'Junkyard Dawgs win hole'; }
                html += `<div class="hole-result ${cls}">${txt}</div>`;
            }
            let mHs = 0, mJd = 0;
            for (let h = 0; h < 9; h++) {
                const r = scoring.getDay3FrontHoleResult(matchIdx, h);
                if (r === 'hs') mHs += 1;
                else if (r === 'jd') mJd += 1;
                else if (r === 'halve') { mHs += 0.5; mJd += 0.5; }
            }
            html += `<div class="match-status"><span class="hs-pts">HS: ${mHs}</span><span class="jd-pts">JD: ${mJd}</span></div>`;
        } else {
            // Show both 1v1 results for this hole
            const backHole = hole - 9;
            const bm1Idx = matchIdx * 2;
            const bm2Idx = matchIdx * 2 + 1;
            const r1 = scoring.getDay3BackHoleResult(bm1Idx, backHole);
            const r2 = scoring.getDay3BackHoleResult(bm2Idx, backHole);
            const p1hs = allPlayers[matchConfig.hs[0]].name.split(' ').pop();
            const p1jd = allPlayers[matchConfig.jd[0]].name.split(' ').pop();
            const p2hs = allPlayers[matchConfig.hs[1]].name.split(' ').pop();
            const p2jd = allPlayers[matchConfig.jd[1]].name.split(' ').pop();

            let r1html = '', r2html = '';
            if (r1) {
                if (r1 === 'hs') r1html = `<span class="hs-pts">${p1hs} wins</span>`;
                else if (r1 === 'jd') r1html = `<span class="jd-pts">${p1jd} wins</span>`;
                else r1html = 'Halved';
            }
            if (r2) {
                if (r2 === 'hs') r2html = `<span class="hs-pts">${p2hs} wins</span>`;
                else if (r2 === 'jd') r2html = `<span class="jd-pts">${p2jd} wins</span>`;
                else r2html = 'Halved';
            }
            html += `<div class="hole-result">${p1hs} vs ${p1jd}: ${r1html || '—'} | ${p2hs} vs ${p2jd}: ${r2html || '—'}</div>`;

            // Running totals for back 9 matches
            let m1Hs = 0, m1Jd = 0, m2Hs = 0, m2Jd = 0;
            for (let h = 0; h < 9; h++) {
                const res1 = scoring.getDay3BackHoleResult(bm1Idx, h);
                if (res1 === 'hs') m1Hs += 1; else if (res1 === 'jd') m1Jd += 1; else if (res1 === 'halve') { m1Hs += 0.5; m1Jd += 0.5; }
                const res2 = scoring.getDay3BackHoleResult(bm2Idx, h);
                if (res2 === 'hs') m2Hs += 1; else if (res2 === 'jd') m2Jd += 1; else if (res2 === 'halve') { m2Hs += 0.5; m2Jd += 0.5; }
            }
            html += `<div class="match-status">
                <span>${p1hs}: ${m1Hs} vs ${p1jd}: ${m1Jd}</span> |
                <span>${p2hs}: ${m2Hs} vs ${p2jd}: ${m2Jd}</span>
            </div>`;
        }

        return html;
    }

    function attachDay3GroupEvents(matchIdx, matchKey, holeKey, matchConfig, course) {
        document.querySelectorAll(`.score-btn[data-day="3g"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);

                if (hole < 9) {
                    // Front 9: store in day3.front
                    if (!scoring.scores.day3.front[matchKey][hole]) scoring.scores.day3.front[matchKey][hole] = [null, null, null, null];
                    scoring.scores.day3.front[matchKey][hole][player] = scoring.scores.day3.front[matchKey][hole][player] === score ? null : score;
                } else {
                    // Back 9: store in day3.back (map 4 players to 2 matches)
                    const backHole = hole - 9;
                    const backMatch1Key = `match${matchIdx * 2 + 1}`;
                    const backMatch2Key = `match${matchIdx * 2 + 2}`;
                    if (player === 0) {
                        if (!scoring.scores.day3.back[backMatch1Key][backHole]) scoring.scores.day3.back[backMatch1Key][backHole] = [null, null];
                        scoring.scores.day3.back[backMatch1Key][backHole][0] = scoring.scores.day3.back[backMatch1Key][backHole][0] === score ? null : score;
                    } else if (player === 1) {
                        if (!scoring.scores.day3.back[backMatch2Key][backHole]) scoring.scores.day3.back[backMatch2Key][backHole] = [null, null];
                        scoring.scores.day3.back[backMatch2Key][backHole][0] = scoring.scores.day3.back[backMatch2Key][backHole][0] === score ? null : score;
                    } else if (player === 2) {
                        if (!scoring.scores.day3.back[backMatch1Key][backHole]) scoring.scores.day3.back[backMatch1Key][backHole] = [null, null];
                        scoring.scores.day3.back[backMatch1Key][backHole][1] = scoring.scores.day3.back[backMatch1Key][backHole][1] === score ? null : score;
                    } else if (player === 3) {
                        if (!scoring.scores.day3.back[backMatch2Key][backHole]) scoring.scores.day3.back[backMatch2Key][backHole] = [null, null];
                        scoring.scores.day3.back[backMatch2Key][backHole][1] = scoring.scores.day3.back[backMatch2Key][backHole][1] === score ? null : score;
                    }
                }

                scoring.saveScores();
                renderAll();
            });
        });
        attachNavEvents(holeKey, 17);
    }

    // Day 3 Front Scorer
    function renderDay3FrontScorer(matchIdx, matchKey, holeKey, matchConfig, course) {
        const hole = currentHole[holeKey];
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const holeScores = scoring.scores.day3.front[matchKey][hole] || [null, null, null, null];

        const allMatchPlayers = [...matchConfig.hs, ...matchConfig.jd];
        const matchHcaps = allMatchPlayers.map(p => getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance));
        const lowestHcap = Math.min(...matchHcaps);

        let html = renderHoleNav(holeKey, hole, 8);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx}</div>`;
        html += renderDots(holeKey, 9, hole, (h) => {
            const hs = scoring.scores.day3.front[matchKey][h];
            return hs && hs.some(v => v !== null);
        });

        html += '<div class="player-scores">';

        // HS
        html += '<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = matchConfig.hs[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            const currentVal = holeScores[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${adjustedHcap} off low${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3f" data-match="${matchKey}" data-hole="${hole}" data-player="${p}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div>';

        // JD
        html += '<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>';
        for (let p = 0; p < 2; p++) {
            const playerKey = matchConfig.jd[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const strokes = getStrokesOnHole(adjustedHcap, strokeIdx);
            const currentVal = holeScores[p + 2];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${adjustedHcap} off low${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3f" data-match="${matchKey}" data-hole="${hole}" data-player="${p + 2}"`, currentVal, par)}
                </div>
                ${currentVal !== null ? `<div class="stableford-result visible">Net: ${netScore}</div>` : ''}
            </div>`;
        }
        html += '</div></div>';

        // Hole result
        const result = scoring.getDay3FrontHoleResult(matchIdx, hole);
        if (result) {
            let cls = 'halve-result', txt = 'Halved';
            if (result === 'hs') { cls = 'hs-result'; txt = 'Hog Suckers win hole'; }
            else if (result === 'jd') { cls = 'jd-result'; txt = 'Junkyard Dawgs win hole'; }
            html += `<div class="hole-result ${cls}">${txt}</div>`;
        }

        // Match running total
        let mHs = 0, mJd = 0;
        for (let h = 0; h < 9; h++) {
            const r = scoring.getDay3FrontHoleResult(matchIdx, h);
            if (r === 'hs') mHs += 1;
            else if (r === 'jd') mJd += 1;
            else if (r === 'halve') { mHs += 0.5; mJd += 0.5; }
        }
        html += `<div class="match-status"><span class="hs-pts">HS: ${mHs}</span><span class="jd-pts">JD: ${mJd}</span></div>`;

        return html;
    }

    function attachDay3FrontEvents(matchIdx, matchKey, holeKey, matchConfig, course) {
        document.querySelectorAll(`.score-btn[data-day="3f"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);
                if (!scoring.scores.day3.front[matchKey][hole]) scoring.scores.day3.front[matchKey][hole] = [null, null, null, null];
                scoring.scores.day3.front[matchKey][hole][player] = scoring.scores.day3.front[matchKey][hole][player] === score ? null : score;
                scoring.saveScores();
                renderAll();
            });
        });
        attachNavEvents(holeKey, 8);
    }

    function renderDay3FrontView(matchIdx, matchKey, matchConfig, course) {
        let html = '<div class="summary-holes">';
        let mHs = 0, mJd = 0;
        for (let h = 0; h < 9; h++) {
            const r = scoring.getDay3FrontHoleResult(matchIdx, h);
            let cls = 'summary-hole';
            if (r === 'hs') { cls += ' hs-win'; mHs += 1; }
            else if (r === 'jd') { cls += ' jd-win'; mJd += 1; }
            else if (r === 'halve') { cls += ' halved'; mHs += 0.5; mJd += 0.5; }
            html += `<div class="${cls}">${h + 1}</div>`;
        }
        html += '</div>';
        html += `<div class="match-status"><span class="hs-pts">HS: ${mHs}</span><span class="jd-pts">JD: ${mJd}</span></div>`;
        return html;
    }

    // Day 3 Back Scorer
    function renderDay3BackScorer(matchIdx, matchKey, holeKey, matchConfig, course) {
        const hole = currentHole[holeKey];
        const courseHoleIdx = hole + 9;
        const par = course.pars[courseHoleIdx];
        const strokeIdx = course.strokeIndex[courseHoleIdx];
        const holeScores = scoring.scores.day3.back[matchKey][hole] || [null, null];

        const hsPlayer = matchConfig.hs;
        const jdPlayer = matchConfig.jd;
        const hsHcap = getPlayerCourseHcap(hsPlayer, CONFIG.days.day3.course, 1.0);
        const jdHcap = getPlayerCourseHcap(jdPlayer, CONFIG.days.day3.course, 1.0);
        const diff = Math.abs(hsHcap - jdHcap);
        const hsGetsStrokes = hsHcap > jdHcap;
        const strokes = getStrokesOnHole(diff, strokeIdx);

        let html = renderHoleNav(holeKey, hole, 8);
        html += `<div class="hole-par-info">Par ${par} | Stroke Index ${strokeIdx}</div>`;
        html += renderDots(holeKey, 9, hole, (h) => {
            const s = scoring.scores.day3.back[matchKey][h];
            return s && s[0] !== null && s[1] !== null;
        });

        html += '<div class="player-scores">';

        // HS Player
        const hsStrokes = hsGetsStrokes ? strokes : 0;
        const hsNetScore = holeScores[0] !== null ? holeScores[0] - hsStrokes : null;
        html += `<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>
            <div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[hsPlayer].name}</span>
                    <span class="player-hcap">${hsHcap} hcp${hsStrokes > 0 ? ' | <b class="stroke-dot">+' + hsStrokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3b" data-match="${matchKey}" data-hole="${hole}" data-player="0"`, holeScores[0], par)}
                </div>
                ${holeScores[0] !== null ? `<div class="stableford-result visible">Net: ${hsNetScore}</div>` : ''}
            </div>
        </div>`;

        // JD Player
        const jdStrokes = !hsGetsStrokes ? strokes : 0;
        const jdNetScore = holeScores[1] !== null ? holeScores[1] - jdStrokes : null;
        html += `<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>
            <div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[jdPlayer].name}</span>
                    <span class="player-hcap">${jdHcap} hcp${jdStrokes > 0 ? ' | <b class="stroke-dot">+' + jdStrokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(`data-day="3b" data-match="${matchKey}" data-hole="${hole}" data-player="1"`, holeScores[1], par)}
                </div>
                ${holeScores[1] !== null ? `<div class="stableford-result visible">Net: ${jdNetScore}</div>` : ''}
            </div>
        </div></div>`;

        // Hole result
        const result = scoring.getDay3BackHoleResult(matchIdx, hole);
        if (result) {
            let cls = 'halve-result', txt = 'Halved';
            if (result === 'hs') { cls = 'hs-result'; txt = `${allPlayers[hsPlayer].name.split(' ')[1]} wins hole`; }
            else if (result === 'jd') { cls = 'jd-result'; txt = `${allPlayers[jdPlayer].name.split(' ')[1]} wins hole`; }
            html += `<div class="hole-result ${cls}">${txt}</div>`;
        }

        // Match total
        let mHs = 0, mJd = 0;
        for (let h = 0; h < 9; h++) {
            const r = scoring.getDay3BackHoleResult(matchIdx, h);
            if (r === 'hs') mHs += 1;
            else if (r === 'jd') mJd += 1;
            else if (r === 'halve') { mHs += 0.5; mJd += 0.5; }
        }
        html += `<div class="match-status"><span class="hs-pts">${allPlayers[hsPlayer].name.split(' ')[1]}: ${mHs}</span><span class="jd-pts">${allPlayers[jdPlayer].name.split(' ')[1]}: ${mJd}</span></div>`;

        return html;
    }

    function attachDay3BackEvents(matchIdx, matchKey, holeKey, matchConfig, course) {
        document.querySelectorAll(`.score-btn[data-day="3b"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);
                if (!scoring.scores.day3.back[matchKey][hole]) scoring.scores.day3.back[matchKey][hole] = [null, null];
                scoring.scores.day3.back[matchKey][hole][player] = scoring.scores.day3.back[matchKey][hole][player] === score ? null : score;
                scoring.saveScores();
                renderAll();
            });
        });
        attachNavEvents(holeKey, 8);
    }

    function renderDay3BackView(matchIdx, matchKey, matchConfig, course) {
        const hsPlayer = matchConfig.hs;
        const jdPlayer = matchConfig.jd;
        let html = '<div class="summary-holes">';
        let mHs = 0, mJd = 0;
        for (let h = 0; h < 9; h++) {
            const r = scoring.getDay3BackHoleResult(matchIdx, h);
            let cls = 'summary-hole';
            if (r === 'hs') { cls += ' hs-win'; mHs += 1; }
            else if (r === 'jd') { cls += ' jd-win'; mJd += 1; }
            else if (r === 'halve') { cls += ' halved'; mHs += 0.5; mJd += 0.5; }
            html += `<div class="${cls}">${h + 10}</div>`;
        }
        html += '</div>';
        html += `<div class="match-status"><span class="hs-pts">${allPlayers[hsPlayer].name.split(' ')[1]}: ${mHs}</span><span class="jd-pts">${allPlayers[jdPlayer].name.split(' ')[1]}: ${mJd}</span></div>`;
        return html;
    }

    // ==================== SCORECARD VIEW ====================
    let currentRound = 1;

    document.querySelectorAll('.round-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.round-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentRound = parseInt(e.target.dataset.round);
            renderScorecard();
        });
    });

    function renderScorecard() {
        const display = document.getElementById('scorecard-display');
        if (!display) return;

        if (currentRound === 1) display.innerHTML = renderScorecardDay1();
        else if (currentRound === 2) display.innerHTML = renderScorecardDay2();
        else display.innerHTML = renderScorecardDay3();
    }

    function renderScorecardDay1() {
        const course = CONFIG.courses[CONFIG.days.day1.course];
        let html = '';

        for (const matchIdx of [1, 2]) {
            const matchKey = `match${matchIdx}`;
            const match = CONFIG.days.day1.matches[matchIdx - 1];
            const scores = scoring.scores.day1[matchKey];

            html += `<div class="sc-match-header">Match ${matchIdx}</div>`;
            html += '<div class="sc-table-wrap"><table class="sc-table sc-table-detailed">';

            // Header row
            html += '<tr><th class="sc-player-col">Hole</th>';
            for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
            html += '<th>Out</th>';
            for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
            html += '<th>In</th><th>Tot</th></tr>';

            // Par row
            html += '<tr class="sc-par-row"><td>Par</td>';
            let fPar = 0, bPar = 0;
            for (let h = 0; h < 9; h++) { html += `<td>${course.pars[h]}</td>`; fPar += course.pars[h]; }
            html += `<td><b>${fPar}</b></td>`;
            for (let h = 9; h < 18; h++) { html += `<td>${course.pars[h]}</td>`; bPar += course.pars[h]; }
            html += `<td><b>${bPar}</b></td><td><b>${fPar + bPar}</b></td></tr>`;

            // HS Players - gross scores and individual stableford
            for (let p = 0; p < 2; p++) {
                const playerKey = match.hs[p];
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);

                // Gross score row
                html += `<tr class="sc-hs"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${hcap})</td>`;
                let fTotal = 0, bTotal = 0;
                for (let h = 0; h < 18; h++) {
                    const teamScores = scores.hs[h];
                    const gross = teamScores ? teamScores[p] : null;
                    const getsStroke = getStrokesOnHole(hcap, course.strokeIndex[h]) > 0;
                    if (gross !== null) { if (h < 9) fTotal += gross; else bTotal += gross; }
                    html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}</td>`;
                    if (h === 8) html += `<td><b>${fTotal || ''}</b></td>`;
                }
                html += `<td><b>${bTotal || ''}</b></td><td><b>${(fTotal + bTotal) || ''}</b></td></tr>`;

                // Individual stableford points row
                html += `<tr class="sc-pts-row sc-hs-pts"><td class="sc-player-col sc-pts-label">pts</td>`;
                let fPts = 0, bPts = 0;
                for (let h = 0; h < 18; h++) {
                    const teamScores = scores.hs[h];
                    const gross = teamScores ? teamScores[p] : null;
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[h]);
                    let pts = '';
                    if (gross !== null) {
                        const sp = scoring.stablefordPoints(gross, course.pars[h], strokes);
                        pts = sp;
                        if (h < 9) fPts += sp; else bPts += sp;
                    }
                    html += `<td>${pts}</td>`;
                    if (h === 8) html += `<td><b>${fPts || ''}</b></td>`;
                }
                html += `<td><b>${bPts || ''}</b></td><td><b>${(fPts + bPts) || ''}</b></td></tr>`;
            }

            // HS Combined stableford row
            html += '<tr class="sc-combined-row sc-hs-combined"><td class="sc-player-col">HS Comb</td>';
            let hsFComb = 0, hsBComb = 0;
            for (let h = 0; h < 18; h++) {
                const hsHole = scores.hs[h];
                let comb = '';
                if (hsHole && hsHole[0] !== null && hsHole[1] !== null) {
                    let total = 0;
                    for (let p = 0; p < 2; p++) {
                        const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                        total += scoring.stablefordPoints(hsHole[p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                    }
                    comb = total;
                    if (h < 9) hsFComb += total; else hsBComb += total;
                }
                html += `<td>${comb}</td>`;
                if (h === 8) html += `<td><b>${hsFComb || ''}</b></td>`;
            }
            html += `<td><b>${hsBComb || ''}</b></td><td><b>${(hsFComb + hsBComb) || ''}</b></td></tr>`;

            // JD Players - gross scores and individual stableford
            for (let p = 0; p < 2; p++) {
                const playerKey = match.jd[p];
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);

                // Gross score row
                html += `<tr class="sc-jd"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${hcap})</td>`;
                let fTotal = 0, bTotal = 0;
                for (let h = 0; h < 18; h++) {
                    const teamScores = scores.jd[h];
                    const gross = teamScores ? teamScores[p] : null;
                    const getsStroke = getStrokesOnHole(hcap, course.strokeIndex[h]) > 0;
                    if (gross !== null) { if (h < 9) fTotal += gross; else bTotal += gross; }
                    html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}</td>`;
                    if (h === 8) html += `<td><b>${fTotal || ''}</b></td>`;
                }
                html += `<td><b>${bTotal || ''}</b></td><td><b>${(fTotal + bTotal) || ''}</b></td></tr>`;

                // Individual stableford points row
                html += `<tr class="sc-pts-row sc-jd-pts"><td class="sc-player-col sc-pts-label">pts</td>`;
                let fPts = 0, bPts = 0;
                for (let h = 0; h < 18; h++) {
                    const teamScores = scores.jd[h];
                    const gross = teamScores ? teamScores[p] : null;
                    const strokes = getStrokesOnHole(hcap, course.strokeIndex[h]);
                    let pts = '';
                    if (gross !== null) {
                        const sp = scoring.stablefordPoints(gross, course.pars[h], strokes);
                        pts = sp;
                        if (h < 9) fPts += sp; else bPts += sp;
                    }
                    html += `<td>${pts}</td>`;
                    if (h === 8) html += `<td><b>${fPts || ''}</b></td>`;
                }
                html += `<td><b>${bPts || ''}</b></td><td><b>${(fPts + bPts) || ''}</b></td></tr>`;
            }

            // JD Combined stableford row
            html += '<tr class="sc-combined-row sc-jd-combined"><td class="sc-player-col">JD Comb</td>';
            let jdFComb = 0, jdBComb = 0;
            for (let h = 0; h < 18; h++) {
                const jdHole = scores.jd[h];
                let comb = '';
                if (jdHole && jdHole[0] !== null && jdHole[1] !== null) {
                    let total = 0;
                    for (let p = 0; p < 2; p++) {
                        const hcap = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                        total += scoring.stablefordPoints(jdHole[p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                    }
                    comb = total;
                    if (h < 9) jdFComb += total; else jdBComb += total;
                }
                html += `<td>${comb}</td>`;
                if (h === 8) html += `<td><b>${jdFComb || ''}</b></td>`;
            }
            html += `<td><b>${jdBComb || ''}</b></td><td><b>${(jdFComb + jdBComb) || ''}</b></td></tr>`;

            // Hole winner row
            html += '<tr class="sc-result-row"><td class="sc-player-col">Winner</td>';
            let hsRunning = 0, jdRunning = 0;
            for (let h = 0; h < 18; h++) {
                const hsHole = scores.hs[h];
                const jdHole = scores.jd[h];
                let cellVal = '', cellClass = '';
                if (hsHole && jdHole && hsHole[0] !== null && hsHole[1] !== null && jdHole[0] !== null && jdHole[1] !== null) {
                    let hsS = 0, jdS = 0;
                    for (let p = 0; p < 2; p++) {
                        hsS += scoring.stablefordPoints(hsHole[p], course.pars[h], getStrokesOnHole(getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), course.strokeIndex[h]));
                        jdS += scoring.stablefordPoints(jdHole[p], course.pars[h], getStrokesOnHole(getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance), course.strokeIndex[h]));
                    }
                    if (hsS > jdS) { cellVal = 'HS'; cellClass = 'sc-win-hs'; hsRunning++; }
                    else if (jdS > hsS) { cellVal = 'JD'; cellClass = 'sc-win-jd'; jdRunning++; }
                    else { cellVal = '-'; cellClass = 'sc-halve'; hsRunning += 0.5; jdRunning += 0.5; }
                }
                html += `<td class="${cellClass}">${cellVal}</td>`;
                if (h === 8) html += '<td></td>';
            }
            html += `<td></td><td class="sc-total">${hsRunning}-${jdRunning}</td></tr>`;
            html += '</table></div>';
        }

        return html;
    }

    function renderScorecardDay2() {
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];
        const allPKeys = [...hsPlayers, ...jdPlayers];
        const allHcaps = allPKeys.map(p => getPlayerCourseHcap(p, CONFIG.days.day2.course, CONFIG.days.day2.allowance));
        const lowestHcap = Math.min(...allHcaps);

        // Pre-calculate best gross/net selections per hole for each team
        function calcBestCombo(teamPlayers, team) {
            const selections = []; // per hole: { bestNetIdx, bestGrossIdx }
            for (let h = 0; h < 18; h++) {
                const holeScores = scoring.scores.day2[team][h];
                if (!holeScores) { selections.push(null); continue; }

                const calcs = teamPlayers.map((playerKey, i) => {
                    const gross = holeScores[i];
                    if (gross === null) return null;
                    const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                    const adjustedHcap = hcap - lowestHcap;
                    const strokes = getStrokesOnHole(adjustedHcap, course.strokeIndex[h]);
                    return { gross, net: gross - strokes, idx: i };
                });

                const valid = calcs.filter(Boolean);
                if (valid.length < 2) { selections.push(null); continue; }

                // Find best combination: best net from one player, best gross from a DIFFERENT player
                let bestTotal = 999, bestNetIdx = -1, bestGrossIdx = -1;
                for (let i = 0; i < valid.length; i++) {
                    for (let j = 0; j < valid.length; j++) {
                        if (i === j) continue;
                        const total = (valid[i].net - course.pars[h]) + (valid[j].gross - course.pars[h]);
                        if (total < bestTotal) {
                            bestTotal = total;
                            bestNetIdx = valid[i].idx;
                            bestGrossIdx = valid[j].idx;
                        }
                    }
                }
                selections.push({ bestNetIdx, bestGrossIdx, bestTotal });
            }
            return selections;
        }

        const hsSelections = calcBestCombo(hsPlayers, 'hs');
        const jdSelections = calcBestCombo(jdPlayers, 'jd');

        let html = '';

        // Render team section
        function renderTeamSection(teamPlayers, team, teamLabel, selections) {
            let teamHtml = `<div class="sc-match-header">${teamLabel}</div>`;
            teamHtml += '<div class="sc-table-wrap"><table class="sc-table sc-table-detailed">';

            // Header
            teamHtml += '<tr><th class="sc-player-col">Hole</th>';
            for (let h = 1; h <= 9; h++) teamHtml += `<th>${h}</th>`;
            teamHtml += '<th>Out</th>';
            for (let h = 10; h <= 18; h++) teamHtml += `<th>${h}</th>`;
            teamHtml += '<th>In</th><th>Tot</th></tr>';

            // Par
            teamHtml += '<tr class="sc-par-row"><td>Par</td>';
            let fPar = 0, bPar = 0;
            for (let h = 0; h < 9; h++) { teamHtml += `<td>${course.pars[h]}</td>`; fPar += course.pars[h]; }
            teamHtml += `<td><b>${fPar}</b></td>`;
            for (let h = 9; h < 18; h++) { teamHtml += `<td>${course.pars[h]}</td>`; bPar += course.pars[h]; }
            teamHtml += `<td><b>${bPar}</b></td><td><b>${fPar + bPar}</b></td></tr>`;

            const cls = team === 'hs' ? 'sc-hs' : 'sc-jd';

            // Player rows
            for (let pIdx = 0; pIdx < teamPlayers.length; pIdx++) {
                const playerKey = teamPlayers[pIdx];
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
                const adjustedHcap = hcap - lowestHcap;

                teamHtml += `<tr class="${cls}"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${adjustedHcap})</td>`;
                let fTotal = 0, bTotal = 0;
                for (let h = 0; h < 18; h++) {
                    const holeScores = scoring.scores.day2[team][h];
                    const gross = holeScores ? holeScores[pIdx] : null;
                    const getsStroke = getStrokesOnHole(adjustedHcap, course.strokeIndex[h]) > 0;
                    if (gross !== null) { if (h < 9) fTotal += gross; else bTotal += gross; }

                    // Determine if this player's score is selected as best gross or best net
                    let cellClass = getsStroke ? 'sc-stroke' : '';
                    let markers = '';
                    if (gross !== null && selections[h]) {
                        if (selections[h].bestGrossIdx === pIdx && selections[h].bestNetIdx === pIdx) {
                            // Should not happen (different player rule) but handle gracefully
                            cellClass += ' sc-best-gross sc-best-net';
                            markers = '<span class="sc-marker-gross">G</span><span class="sc-marker-net">N</span>';
                        } else if (selections[h].bestGrossIdx === pIdx) {
                            cellClass += ' sc-best-gross';
                            markers = '<span class="sc-marker-gross">G</span>';
                        } else if (selections[h].bestNetIdx === pIdx) {
                            cellClass += ' sc-best-net';
                            markers = '<span class="sc-marker-net">N</span>';
                        }
                    }

                    teamHtml += `<td class="${cellClass}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}${markers}</td>`;
                    if (h === 8) teamHtml += `<td><b>${fTotal || ''}</b></td>`;
                }
                teamHtml += `<td><b>${bTotal || ''}</b></td><td><b>${(fTotal + bTotal) || ''}</b></td></tr>`;
            }

            // Team combined score vs par row
            teamHtml += `<tr class="sc-combined-row ${team === 'hs' ? 'sc-hs-combined' : 'sc-jd-combined'}"><td class="sc-player-col">vs Par</td>`;
            let fVsPar = 0, bVsPar = 0;
            for (let h = 0; h < 18; h++) {
                let cellVal = '';
                if (selections[h] && selections[h].bestTotal !== undefined) {
                    const holeVsPar = selections[h].bestTotal;
                    cellVal = holeVsPar === 0 ? 'E' : (holeVsPar > 0 ? '+' + holeVsPar : holeVsPar);
                    if (h < 9) fVsPar += holeVsPar; else bVsPar += holeVsPar;
                }
                teamHtml += `<td>${cellVal}</td>`;
                if (h === 8) {
                    const fStr = fVsPar === 0 ? 'E' : (fVsPar > 0 ? '+' + fVsPar : fVsPar);
                    teamHtml += `<td><b>${fVsPar !== 0 || selections.slice(0,9).some(s => s) ? fStr : ''}</b></td>`;
                }
            }
            const bStr = bVsPar === 0 ? 'E' : (bVsPar > 0 ? '+' + bVsPar : bVsPar);
            const tVsPar = fVsPar + bVsPar;
            const tStr = tVsPar === 0 ? 'E' : (tVsPar > 0 ? '+' + tVsPar : tVsPar);
            const hasAnyScore = selections.some(s => s);
            teamHtml += `<td><b>${hasAnyScore ? bStr : ''}</b></td><td><b>${hasAnyScore ? tStr : ''}</b></td></tr>`;

            teamHtml += '</table></div>';
            return teamHtml;
        }

        html += renderTeamSection(hsPlayers, 'hs', 'Hog Suckers', hsSelections);
        html += renderTeamSection(jdPlayers, 'jd', 'Junkyard Dawgs', jdSelections);

        // Summary comparison
        const d2 = scoring.calcDay2();
        html += `<div class="match-status">
            <span class="hs-pts"><b>HS: ${d2.hsPoints} pts</b></span>
            <span>${d2.holesPlayed}/18 holes</span>
            <span class="jd-pts"><b>JD: ${d2.jdPoints} pts</b></span>
        </div>`;

        return html;
    }

    function renderScorecardDay3() {
        const course = CONFIG.courses[CONFIG.days.day3.course];
        let html = '';

        // Front 9
        for (let m = 0; m < 2; m++) {
            const matchKey = `match${m + 1}`;
            const matchConfig = CONFIG.days.day3.front.matches[m];
            const allMatchPlayers = [...matchConfig.hs, ...matchConfig.jd];
            const matchHcaps = allMatchPlayers.map(p => getPlayerCourseHcap(p, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance));
            const lowestHcap = Math.min(...matchHcaps);

            html += `<div class="sc-match-header">Front 9 - Match ${m + 1} (Best Ball)</div>`;
            html += '<div class="sc-table-wrap"><table class="sc-table">';
            html += '<tr><th class="sc-player-col">Hole</th>';
            for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
            html += '<th>Tot</th></tr>';

            // Par
            html += '<tr class="sc-par-row"><td>Par</td>';
            let totalPar = 0;
            for (let h = 0; h < 9; h++) { html += `<td>${course.pars[h]}</td>`; totalPar += course.pars[h]; }
            html += `<td><b>${totalPar}</b></td></tr>`;

            // Players
            for (let pIdx = 0; pIdx < 4; pIdx++) {
                const playerKey = allMatchPlayers[pIdx];
                const isHs = pIdx < 2;
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day3.course, CONFIG.days.day3.front.allowance);
                const adjustedHcap = hcap - lowestHcap;
                const cls = isHs ? 'sc-hs' : 'sc-jd';

                html += `<tr class="${cls}"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${adjustedHcap})</td>`;
                let total = 0;
                for (let h = 0; h < 9; h++) {
                    const holeScores = scoring.scores.day3.front[matchKey][h];
                    const gross = holeScores ? holeScores[pIdx] : null;
                    const getsStroke = getStrokesOnHole(adjustedHcap, course.strokeIndex[h]) > 0;
                    if (gross !== null) total += gross;
                    html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}</td>`;
                }
                html += `<td><b>${total || ''}</b></td></tr>`;
            }

            // Result row
            html += '<tr class="sc-result-row"><td>Result</td>';
            let mHs = 0, mJd = 0;
            for (let h = 0; h < 9; h++) {
                const r = scoring.getDay3FrontHoleResult(m, h);
                let cellVal = '', cellClass = '';
                if (r === 'hs') { cellVal = 'HS'; cellClass = 'sc-win-hs'; mHs++; }
                else if (r === 'jd') { cellVal = 'JD'; cellClass = 'sc-win-jd'; mJd++; }
                else if (r === 'halve') { cellVal = '-'; cellClass = 'sc-halve'; mHs += 0.5; mJd += 0.5; }
                html += `<td class="${cellClass}">${cellVal}</td>`;
            }
            html += `<td class="sc-total">${mHs}-${mJd}</td></tr>`;
            html += '</table></div>';
        }

        // Back 9
        for (let m = 0; m < 4; m++) {
            const matchKey = `match${m + 1}`;
            const matchConfig = CONFIG.days.day3.back.matches[m];
            const hsPlayer = matchConfig.hs;
            const jdPlayer = matchConfig.jd;
            const hsHcap = getPlayerCourseHcap(hsPlayer, CONFIG.days.day3.course, 1.0);
            const jdHcap = getPlayerCourseHcap(jdPlayer, CONFIG.days.day3.course, 1.0);
            const diff = Math.abs(hsHcap - jdHcap);
            const hsGetsStrokes = hsHcap > jdHcap;

            html += `<div class="sc-match-header">Back 9 - ${allPlayers[hsPlayer].name.split(' ')[1]} vs ${allPlayers[jdPlayer].name.split(' ')[1]}</div>`;
            html += '<div class="sc-table-wrap"><table class="sc-table">';
            html += '<tr><th class="sc-player-col">Hole</th>';
            for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
            html += '<th>Tot</th></tr>';

            // Par
            html += '<tr class="sc-par-row"><td>Par</td>';
            let totalPar2 = 0;
            for (let h = 9; h < 18; h++) { html += `<td>${course.pars[h]}</td>`; totalPar2 += course.pars[h]; }
            html += `<td><b>${totalPar2}</b></td></tr>`;

            // HS player
            html += `<tr class="sc-hs"><td class="sc-player-col">${allPlayers[hsPlayer].name.split(' ')[1]} (${hsGetsStrokes ? diff : 0})</td>`;
            let hsTotal = 0;
            for (let h = 0; h < 9; h++) {
                const holeScores = scoring.scores.day3.back[matchKey][h];
                const gross = holeScores ? holeScores[0] : null;
                const courseHoleIdx = h + 9;
                const strokes = hsGetsStrokes ? getStrokesOnHole(diff, course.strokeIndex[courseHoleIdx]) : 0;
                const getsStroke = strokes > 0;
                if (gross !== null) hsTotal += gross;
                html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}</td>`;
            }
            html += `<td><b>${hsTotal || ''}</b></td></tr>`;

            // JD player
            html += `<tr class="sc-jd"><td class="sc-player-col">${allPlayers[jdPlayer].name.split(' ')[1]} (${!hsGetsStrokes ? diff : 0})</td>`;
            let jdTotal = 0;
            for (let h = 0; h < 9; h++) {
                const holeScores = scoring.scores.day3.back[matchKey][h];
                const gross = holeScores ? holeScores[1] : null;
                const courseHoleIdx = h + 9;
                const strokes = !hsGetsStrokes ? getStrokesOnHole(diff, course.strokeIndex[courseHoleIdx]) : 0;
                const getsStroke = strokes > 0;
                if (gross !== null) jdTotal += gross;
                html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${gross !== null ? gross : ''}${getsStroke && gross !== null ? '*' : ''}</td>`;
            }
            html += `<td><b>${jdTotal || ''}</b></td></tr>`;

            // Result row
            html += '<tr class="sc-result-row"><td>Result</td>';
            let mHs = 0, mJd = 0;
            for (let h = 0; h < 9; h++) {
                const r = scoring.getDay3BackHoleResult(m, h);
                let cellVal = '', cellClass = '';
                if (r === 'hs') { cellVal = allPlayers[hsPlayer].name.split(' ')[1][0]; cellClass = 'sc-win-hs'; mHs++; }
                else if (r === 'jd') { cellVal = allPlayers[jdPlayer].name.split(' ')[1][0]; cellClass = 'sc-win-jd'; mJd++; }
                else if (r === 'halve') { cellVal = '-'; cellClass = 'sc-halve'; mHs += 0.5; mJd += 0.5; }
                html += `<td class="${cellClass}">${cellVal}</td>`;
            }
            html += `<td class="sc-total">${mHs}-${mJd}</td></tr>`;
            html += '</table></div>';
        }

        return html;
    }

    window.renderAll = renderAll;
    renderAll();
    renderScorecard();
});
