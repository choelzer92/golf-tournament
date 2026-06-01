document.addEventListener('DOMContentLoaded', () => {
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
        document.getElementById('hs-total').textContent = totals.total.hs;
        document.getElementById('jd-total').textContent = totals.total.jd;
        document.getElementById('hs-d1').textContent = totals.day1.hs;
        document.getElementById('jd-d1').textContent = totals.day1.jd;
        document.getElementById('hs-d2').textContent = totals.day2.hs;
        document.getElementById('jd-d2').textContent = totals.day2.jd;
        document.getElementById('hs-d3').textContent = totals.day3.hs;
        document.getElementById('jd-d3').textContent = totals.day3.jd;
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

        const rankings = scoring.calcDay1AllIndividuals();
        let indHtml = '';
        if (rankings.length > 0 && rankings[0].holesPlayed > 0) {
            indHtml = '<div class="individual-rankings">';
            rankings.forEach((r, idx) => {
                const name = allPlayers[r.playerKey].name;
                const cls = r.team === 'hs' ? 'hs-pts' : 'jd-pts';
                const leader = idx === 0 ? ' leader' : '';
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
        const container = document.querySelector('#d2-team .scorecard-container');
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];

        if (scorerMode) {
            container.innerHTML = renderDay2Scorer(course, hsPlayers, jdPlayers);
            attachDay2Events(course, hsPlayers, jdPlayers);
        } else {
            container.innerHTML = renderDay2View(course, hsPlayers, jdPlayers);
        }

        // Junk
        if (scorerMode) {
            document.getElementById('d2-junk-hs').innerHTML = `<input type="number" class="junk-input" id="junk-hs-input" value="${scoring.scores.day2.junk.hs || 0}" inputmode="numeric">`;
            document.getElementById('d2-junk-jd').innerHTML = `<input type="number" class="junk-input" id="junk-jd-input" value="${scoring.scores.day2.junk.jd || 0}" inputmode="numeric">`;
            document.getElementById('junk-hs-input').addEventListener('change', (e) => {
                scoring.scores.day2.junk.hs = parseInt(e.target.value) || 0;
                scoring.saveScores(); renderLeaderboard();
            });
            document.getElementById('junk-jd-input').addEventListener('change', (e) => {
                scoring.scores.day2.junk.jd = parseInt(e.target.value) || 0;
                scoring.saveScores(); renderLeaderboard();
            });
        } else {
            document.getElementById('d2-junk-hs').textContent = scoring.scores.day2.junk.hs || 0;
            document.getElementById('d2-junk-jd').textContent = scoring.scores.day2.junk.jd || 0;
        }
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
            <span class="hs-pts">HS: ${d2.hsFront + d2.hsBack >= 0 ? '+' : ''}${d2.hsFront + d2.hsBack}</span>
            <span>vs par</span>
            <span class="jd-pts">JD: ${d2.jdFront + d2.jdBack >= 0 ? '+' : ''}${d2.jdFront + d2.jdBack}</span>
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
            <div><div class="hs-pts">F: ${d2.hsFront >= 0 ? '+' : ''}${d2.hsFront} | B: ${d2.hsBack >= 0 ? '+' : ''}${d2.hsBack}</div><div class="hs-pts"><b>HS: ${d2.hsPoints} pts</b></div></div>
            <div style="text-align:right"><div class="jd-pts">F: ${d2.jdFront >= 0 ? '+' : ''}${d2.jdFront} | B: ${d2.jdBack >= 0 ? '+' : ''}${d2.jdBack}</div><div class="jd-pts"><b>JD: ${d2.jdPoints} pts</b></div></div>
        </div>`;
        return html;
    }

    // ==================== DAY 3 ====================
    function renderDay3() {
        const course = CONFIG.courses[CONFIG.days.day3.course];

        // Front 9 matches
        for (let m = 0; m < 2; m++) {
            const matchEl = document.getElementById(`d3-front-match${m + 1}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m + 1}`;
            const holeKey = `day3f${m + 1}`;
            const matchConfig = CONFIG.days.day3.front.matches[m];

            if (scorerMode) {
                container.innerHTML = renderDay3FrontScorer(m, matchKey, holeKey, matchConfig, course);
                attachDay3FrontEvents(m, matchKey, holeKey, matchConfig, course);
            } else {
                container.innerHTML = renderDay3FrontView(m, matchKey, matchConfig, course);
            }
        }

        // Back 9 matches
        for (let m = 0; m < 4; m++) {
            const matchEl = document.getElementById(`d3-back-match${m + 1}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m + 1}`;
            const holeKey = `day3b${m + 1}`;
            const matchConfig = CONFIG.days.day3.back.matches[m];

            if (scorerMode) {
                container.innerHTML = renderDay3BackScorer(m, matchKey, holeKey, matchConfig, course);
                attachDay3BackEvents(m, matchKey, holeKey, matchConfig, course);
            } else {
                container.innerHTML = renderDay3BackView(m, matchKey, matchConfig, course);
            }
        }
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
            const players = [...match.hs, ...match.jd];
            const teams = ['hs', 'hs', 'jd', 'jd'];

            html += `<div class="sc-match-header">Match ${matchIdx}</div>`;
            html += '<div class="sc-table-wrap"><table class="sc-table">';

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

            // Player rows
            for (let pIdx = 0; pIdx < 4; pIdx++) {
                const playerKey = players[pIdx];
                const team = teams[pIdx];
                const pInTeam = pIdx < 2 ? pIdx : pIdx - 2;
                const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                const cls = team === 'hs' ? 'sc-hs' : 'sc-jd';

                html += `<tr class="${cls}"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${hcap})</td>`;
                let fTotal = 0, bTotal = 0;
                for (let h = 0; h < 18; h++) {
                    const teamScores = scores[team][h];
                    const gross = teamScores ? teamScores[pInTeam] : null;
                    const getsStroke = getStrokesOnHole(hcap, course.strokeIndex[h]) > 0;
                    let cellContent = gross !== null ? gross : '';
                    let cellClass = getsStroke ? 'sc-stroke' : '';
                    if (gross !== null) {
                        if (h < 9) fTotal += gross; else bTotal += gross;
                    }
                    html += `<td class="${cellClass}">${cellContent}${getsStroke && gross !== null ? '*' : ''}</td>`;
                    if (h === 8) html += `<td><b>${fTotal || ''}</b></td>`;
                }
                html += `<td><b>${bTotal || ''}</b></td><td><b>${(fTotal + bTotal) || ''}</b></td></tr>`;
            }

            // Team stableford result row
            html += '<tr class="sc-result-row"><td>Result</td>';
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

        let html = '<div class="sc-table-wrap"><table class="sc-table">';

        // Header
        html += '<tr><th class="sc-player-col">Hole</th>';
        for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
        html += '<th>Out</th>';
        for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
        html += '<th>In</th><th>Tot</th></tr>';

        // Par
        html += '<tr class="sc-par-row"><td>Par</td>';
        let fPar = 0, bPar = 0;
        for (let h = 0; h < 9; h++) { html += `<td>${course.pars[h]}</td>`; fPar += course.pars[h]; }
        html += `<td><b>${fPar}</b></td>`;
        for (let h = 9; h < 18; h++) { html += `<td>${course.pars[h]}</td>`; bPar += course.pars[h]; }
        html += `<td><b>${bPar}</b></td><td><b>${fPar + bPar}</b></td></tr>`;

        // All 8 players
        for (const playerKey of allPKeys) {
            const isHs = hsPlayers.includes(playerKey);
            const team = isHs ? 'hs' : 'jd';
            const pIdx = isHs ? hsPlayers.indexOf(playerKey) : jdPlayers.indexOf(playerKey);
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const adjustedHcap = hcap - lowestHcap;
            const cls = isHs ? 'sc-hs' : 'sc-jd';

            html += `<tr class="${cls}"><td class="sc-player-col">${allPlayers[playerKey].name.split(' ')[1]} (${adjustedHcap})</td>`;
            let fTotal = 0, bTotal = 0;
            for (let h = 0; h < 18; h++) {
                const holeScores = scoring.scores.day2[team][h];
                const gross = holeScores ? holeScores[pIdx] : null;
                const getsStroke = getStrokesOnHole(adjustedHcap, course.strokeIndex[h]) > 0;
                let cellContent = gross !== null ? gross : '';
                if (gross !== null) { if (h < 9) fTotal += gross; else bTotal += gross; }
                html += `<td class="${getsStroke ? 'sc-stroke' : ''}">${cellContent}${getsStroke && gross !== null ? '*' : ''}</td>`;
                if (h === 8) html += `<td><b>${fTotal || ''}</b></td>`;
            }
            html += `<td><b>${bTotal || ''}</b></td><td><b>${(fTotal + bTotal) || ''}</b></td></tr>`;
        }

        html += '</table></div>';
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
