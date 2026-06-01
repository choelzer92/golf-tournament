document.addEventListener('DOMContentLoaded', () => {
    const scoring = new TournamentScoring();
    window.tournamentScoring = scoring;
    let scorerMode = false;

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
        renderLeaderboard();
        renderDay1();
        renderDay2();
        renderDay3();
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

    // Day 1 Rendering
    function renderDay1() {
        for (const matchIdx of [1, 2]) {
            const matchKey = `match${matchIdx}`;
            const matchEl = document.getElementById(`d1-${matchKey}`);
            const container = matchEl.querySelector('.scorecard-container');
            const match = CONFIG.days.day1.matches[matchIdx - 1];
            const course = CONFIG.courses[CONFIG.days.day1.course];
            const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };

            if (scorerMode) {
                container.innerHTML = renderDay1ScorerTable(matchKey, match, course, allPlayers);
                attachDay1Inputs(matchKey, match, course);
            } else {
                container.innerHTML = renderDay1ViewTable(matchKey, match, course);
            }
        }

        // Individual leader
        const indResult = scoring.calcDay1Individual();
        const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
        if (indResult.player && indResult.total > 0) {
            const playerName = allPlayers[indResult.player].name;
            const teamLabel = indResult.team === 'hs' ? 'Hog Suckers' : 'Junkyard Dawgs';
            document.getElementById('d1-individual-leader').innerHTML =
                `<span class="${indResult.team === 'hs' ? 'hs-pts' : 'jd-pts'}">${playerName} - ${indResult.total} pts (${teamLabel})</span>`;
        }
    }

    function renderDay1ScorerTable(matchKey, match, course, allPlayers) {
        const scores = scoring.scores.day1[matchKey];
        let html = '<div class="scorer-grid">';

        // Header
        html += '<div class="scorer-hole-header"><span>Hole</span>';
        html += `<span class="hs-label">${allPlayers[match.hs[0]].name.split(' ')[1]}</span>`;
        html += `<span class="hs-label">${allPlayers[match.hs[1]].name.split(' ')[1]}</span>`;
        html += `<span class="jd-label">${allPlayers[match.jd[0]].name.split(' ')[1]}</span>`;
        html += `<span class="jd-label">${allPlayers[match.jd[1]].name.split(' ')[1]}</span>`;
        html += '<span>Result</span></div>';

        for (let h = 0; h < 18; h++) {
            const hsHole = scores.hs[h] || [null, null];
            const jdHole = scores.jd[h] || [null, null];

            html += `<div class="scorer-hole-row">`;
            html += `<span class="hole-num-cell">${h + 1}<br><small>P${course.pars[h]}</small></span>`;
            html += `<input type="number" class="score-input" data-match="${matchKey}" data-team="hs" data-hole="${h}" data-player="0" value="${hsHole[0] !== null ? hsHole[0] : ''}" inputmode="numeric">`;
            html += `<input type="number" class="score-input" data-match="${matchKey}" data-team="hs" data-hole="${h}" data-player="1" value="${hsHole[1] !== null ? hsHole[1] : ''}" inputmode="numeric">`;
            html += `<input type="number" class="score-input" data-match="${matchKey}" data-team="jd" data-hole="${h}" data-player="0" value="${jdHole[0] !== null ? jdHole[0] : ''}" inputmode="numeric">`;
            html += `<input type="number" class="score-input" data-match="${matchKey}" data-team="jd" data-hole="${h}" data-player="1" value="${jdHole[1] !== null ? jdHole[1] : ''}" inputmode="numeric">`;

            // Show result
            let result = '';
            if (hsHole[0] !== null && hsHole[1] !== null && jdHole[0] !== null && jdHole[1] !== null) {
                let hsS = 0, jdS = 0;
                for (let p = 0; p < 2; p++) {
                    const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    hsS += scoring.stablefordPoints(hsHole[p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                    const hcapJ = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    jdS += scoring.stablefordPoints(jdHole[p], course.pars[h], getStrokesOnHole(hcapJ, course.strokeIndex[h]));
                }
                if (hsS > jdS) result = `<span class="hs-pts">${hsS}-${jdS}</span>`;
                else if (jdS > hsS) result = `<span class="jd-pts">${jdS}-${hsS}</span>`;
                else result = `<span class="halve-pts">${hsS}-${jdS}</span>`;
            }
            html += `<span class="result-cell">${result}</span>`;
            html += '</div>';

            if (h === 8) {
                html += '<div class="nine-divider">TURN</div>';
            }
        }
        html += '</div>';

        // Match status
        const matchResult = scoring.calcDay1Match(matchKey);
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${matchResult.hsPoints}</span>
            <span>${matchResult.holesPlayed}/18 holes</span>
            <span class="jd-pts">JD: ${matchResult.jdPoints}</span>
        </div>`;

        return html;
    }

    function attachDay1Inputs(matchKey, match, course) {
        document.querySelectorAll(`.score-input[data-match="${matchKey}"]`).forEach(input => {
            input.addEventListener('change', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const val = e.target.value === '' ? null : parseInt(e.target.value);

                if (!scoring.scores.day1[matchKey][team][hole]) {
                    scoring.scores.day1[matchKey][team][hole] = [null, null];
                }
                scoring.scores.day1[matchKey][team][hole][player] = val;
                scoring.saveScores();
                renderAll();
            });
        });
    }

    function renderDay1ViewTable(matchKey, match, course) {
        let html = '<div class="scorecard"><table><tr><th>Hole</th>';
        for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
        html += '<th>Out</th>';
        for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
        html += '<th>In</th><th>Tot</th></tr>';

        // Par row
        html += '<tr><td class="hole-num">Par</td>';
        let frontPar = 0, backPar = 0;
        for (let h = 0; h < 9; h++) { html += `<td>${course.pars[h]}</td>`; frontPar += course.pars[h]; }
        html += `<td><b>${frontPar}</b></td>`;
        for (let h = 9; h < 18; h++) { html += `<td>${course.pars[h]}</td>`; backPar += course.pars[h]; }
        html += `<td><b>${backPar}</b></td><td><b>${frontPar + backPar}</b></td></tr>`;

        // HS combined stableford row
        html += '<tr><td class="hole-num" style="color:var(--hs-color)">HS</td>';
        let hsFront = 0, hsBack = 0;
        for (let h = 0; h < 18; h++) {
            const scores = scoring.scores.day1[matchKey];
            let cellVal = '';
            if (scores && scores.hs && scores.hs[h] && scores.hs[h][0] !== null && scores.hs[h][1] !== null) {
                let combined = 0;
                for (let p = 0; p < 2; p++) {
                    const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    combined += scoring.stablefordPoints(scores.hs[h][p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                }
                cellVal = combined;
                if (h < 9) hsFront += combined; else hsBack += combined;
            }
            html += `<td class="hs-score">${cellVal}</td>`;
            if (h === 8) html += `<td class="hs-score"><b>${hsFront || ''}</b></td>`;
        }
        html += `<td class="hs-score"><b>${hsBack || ''}</b></td><td class="hs-score"><b>${(hsFront + hsBack) || ''}</b></td></tr>`;

        // JD combined stableford row
        html += '<tr><td class="hole-num" style="color:var(--jd-color)">JD</td>';
        let jdFront = 0, jdBack = 0;
        for (let h = 0; h < 18; h++) {
            const scores = scoring.scores.day1[matchKey];
            let cellVal = '';
            if (scores && scores.jd && scores.jd[h] && scores.jd[h][0] !== null && scores.jd[h][1] !== null) {
                let combined = 0;
                for (let p = 0; p < 2; p++) {
                    const hcap = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    combined += scoring.stablefordPoints(scores.jd[h][p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                }
                cellVal = combined;
                if (h < 9) jdFront += combined; else jdBack += combined;
            }
            html += `<td class="jd-score">${cellVal}</td>`;
            if (h === 8) html += `<td class="jd-score"><b>${jdFront || ''}</b></td>`;
        }
        html += `<td class="jd-score"><b>${jdBack || ''}</b></td><td class="jd-score"><b>${(jdFront + jdBack) || ''}</b></td></tr>`;

        // Result row
        html += '<tr><td class="hole-num">W</td>';
        let hsMatchPts = 0, jdMatchPts = 0;
        for (let h = 0; h < 18; h++) {
            const scores = scoring.scores.day1[matchKey];
            let cellVal = '', cellClass = '';
            if (scores && scores.hs && scores.hs[h] && scores.jd && scores.jd[h] &&
                scores.hs[h][0] !== null && scores.hs[h][1] !== null &&
                scores.jd[h][0] !== null && scores.jd[h][1] !== null) {
                let hsS = 0, jdS = 0;
                for (let p = 0; p < 2; p++) {
                    const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    hsS += scoring.stablefordPoints(scores.hs[h][p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                    const hcapJ = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                    jdS += scoring.stablefordPoints(scores.jd[h][p], course.pars[h], getStrokesOnHole(hcapJ, course.strokeIndex[h]));
                }
                if (hsS > jdS) { cellVal = 'HS'; cellClass = 'winner-hs'; hsMatchPts += 1; }
                else if (jdS > hsS) { cellVal = 'JD'; cellClass = 'winner-jd'; jdMatchPts += 1; }
                else { cellVal = '-'; cellClass = 'halved'; hsMatchPts += 0.5; jdMatchPts += 0.5; }
            }
            html += `<td class="${cellClass}">${cellVal}</td>`;
            if (h === 8) html += '<td></td>';
        }
        html += '<td></td><td></td></tr>';
        html += '</table></div>';

        html += `<div class="match-status">
            <span class="hs-pts">HS: ${hsMatchPts}</span>
            <span>of 18</span>
            <span class="jd-pts">JD: ${jdMatchPts}</span>
        </div>`;

        return html;
    }

    // Day 2 Rendering
    function renderDay2() {
        const container = document.querySelector('#d2-team .scorecard-container');
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];
        const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };

        if (scorerMode) {
            container.innerHTML = renderDay2Scorer(course, hsPlayers, jdPlayers, allPlayers);
            attachDay2Inputs(course, hsPlayers, jdPlayers);
        } else {
            const d2 = scoring.calcDay2();
            const scoring2 = CONFIG.days.day2.scoring;
            container.innerHTML = `<div class="match-status">
                <div>
                    <div class="hs-pts">Front: ${d2.hsFront >= 0 ? '+' : ''}${d2.hsFront}</div>
                    <div class="hs-pts">Back: ${d2.hsBack >= 0 ? '+' : ''}${d2.hsBack}</div>
                    <div class="hs-pts"><b>HS: ${d2.hsPoints} pts</b></div>
                </div>
                <div style="text-align:center;font-size:11px;color:#666">
                    F9: ${scoring2.front} | B9: ${scoring2.back}<br>OA: ${scoring2.overall} | Junk: ${scoring2.junk}
                </div>
                <div style="text-align:right">
                    <div class="jd-pts">Front: ${d2.jdFront >= 0 ? '+' : ''}${d2.jdFront}</div>
                    <div class="jd-pts">Back: ${d2.jdBack >= 0 ? '+' : ''}${d2.jdBack}</div>
                    <div class="jd-pts"><b>JD: ${d2.jdPoints} pts</b></div>
                </div>
            </div>`;
        }

        // Junk section
        if (scorerMode) {
            document.getElementById('d2-junk-hs').innerHTML = `<input type="number" class="score-input junk-input" id="junk-hs-input" value="${scoring.scores.day2.junk.hs || 0}" inputmode="numeric" style="width:50px;font-size:20px">`;
            document.getElementById('d2-junk-jd').innerHTML = `<input type="number" class="score-input junk-input" id="junk-jd-input" value="${scoring.scores.day2.junk.jd || 0}" inputmode="numeric" style="width:50px;font-size:20px">`;
            document.getElementById('junk-hs-input').addEventListener('change', (e) => {
                scoring.scores.day2.junk.hs = parseInt(e.target.value) || 0;
                scoring.saveScores();
                renderLeaderboard();
            });
            document.getElementById('junk-jd-input').addEventListener('change', (e) => {
                scoring.scores.day2.junk.jd = parseInt(e.target.value) || 0;
                scoring.saveScores();
                renderLeaderboard();
            });
        } else {
            document.getElementById('d2-junk-hs').textContent = scoring.scores.day2.junk.hs || 0;
            document.getElementById('d2-junk-jd').textContent = scoring.scores.day2.junk.jd || 0;
        }
    }

    function renderDay2Scorer(course, hsPlayers, jdPlayers, allPlayers) {
        let html = '<div class="scorer-grid">';
        html += '<div class="scorer-hole-header d2-header"><span>Hole</span>';
        hsPlayers.forEach(p => html += `<span class="hs-label">${allPlayers[p].name.split(' ')[1]}</span>`);
        jdPlayers.forEach(p => html += `<span class="jd-label">${allPlayers[p].name.split(' ')[1]}</span>`);
        html += '</div>';

        for (let h = 0; h < 18; h++) {
            const hsHole = scoring.scores.day2.hs[h] || [null, null, null, null];
            const jdHole = scoring.scores.day2.jd[h] || [null, null, null, null];

            html += `<div class="scorer-hole-row d2-row">`;
            html += `<span class="hole-num-cell">${h + 1}<br><small>P${course.pars[h]}</small></span>`;
            for (let p = 0; p < 4; p++) {
                html += `<input type="number" class="score-input d2-input" data-team="hs" data-hole="${h}" data-player="${p}" value="${hsHole[p] !== null ? hsHole[p] : ''}" inputmode="numeric">`;
            }
            for (let p = 0; p < 4; p++) {
                html += `<input type="number" class="score-input d2-input" data-team="jd" data-hole="${h}" data-player="${p}" value="${jdHole[p] !== null ? jdHole[p] : ''}" inputmode="numeric">`;
            }
            html += '</div>';

            if (h === 8) html += '<div class="nine-divider">TURN</div>';
        }
        html += '</div>';
        return html;
    }

    function attachDay2Inputs(course, hsPlayers, jdPlayers) {
        document.querySelectorAll('.d2-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const val = e.target.value === '' ? null : parseInt(e.target.value);

                if (!scoring.scores.day2[team][hole]) {
                    scoring.scores.day2[team][hole] = [null, null, null, null];
                }
                scoring.scores.day2[team][hole][player] = val;
                scoring.saveScores();
                renderLeaderboard();
            });
        });
    }

    // Day 3 Rendering
    function renderDay3() {
        // Front 9 matches
        for (let m = 1; m <= 2; m++) {
            const matchEl = document.getElementById(`d3-front-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;

            if (scorerMode) {
                container.innerHTML = renderDay3MatchScorer('front', matchKey, 9, 1);
                attachDay3Inputs('front', matchKey, 9, 1);
            } else {
                container.innerHTML = renderDay3MatchView('front', matchKey, 9, 1);
            }
        }

        // Back 9 matches
        for (let m = 1; m <= 4; m++) {
            const matchEl = document.getElementById(`d3-back-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;

            if (scorerMode) {
                container.innerHTML = renderDay3MatchScorer('back', matchKey, 9, 10);
                attachDay3Inputs('back', matchKey, 9, 10);
            } else {
                container.innerHTML = renderDay3MatchView('back', matchKey, 9, 10);
            }
        }
    }

    function renderDay3MatchScorer(nine, matchKey, numHoles, startHole) {
        let html = '<div class="d3-scorer">';
        for (let h = 0; h < numHoles; h++) {
            const current = scoring.scores.day3[nine][matchKey] ? scoring.scores.day3[nine][matchKey][h] : null;
            html += `<div class="d3-hole-row">`;
            html += `<span class="hole-num-cell">${startHole + h}</span>`;
            html += `<button class="d3-btn hs-btn ${current === 'hs' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="hs">HS</button>`;
            html += `<button class="d3-btn halve-btn ${current === 'halve' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="halve">-</button>`;
            html += `<button class="d3-btn jd-btn ${current === 'jd' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="jd">JD</button>`;
            html += '</div>';
        }
        html += '</div>';

        // Status
        let hsP = 0, jdP = 0;
        for (let h = 0; h < numHoles; h++) {
            const r = scoring.scores.day3[nine][matchKey] ? scoring.scores.day3[nine][matchKey][h] : null;
            if (r === 'hs') hsP += 1;
            else if (r === 'jd') jdP += 1;
            else if (r === 'halve') { hsP += 0.5; jdP += 0.5; }
        }
        html += `<div class="match-status"><span class="hs-pts">HS: ${hsP}</span><span class="jd-pts">JD: ${jdP}</span></div>`;
        return html;
    }

    function attachDay3Inputs(nine, matchKey, numHoles, startHole) {
        document.querySelectorAll(`.d3-btn[data-nine="${nine}"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const val = e.target.dataset.val;

                if (!scoring.scores.day3[nine][matchKey]) {
                    scoring.scores.day3[nine][matchKey] = Array(numHoles).fill(null);
                }

                // Toggle off if same value clicked again
                if (scoring.scores.day3[nine][matchKey][hole] === val) {
                    scoring.scores.day3[nine][matchKey][hole] = null;
                } else {
                    scoring.scores.day3[nine][matchKey][hole] = val;
                }
                scoring.saveScores();
                renderAll();
            });
        });
    }

    function renderDay3MatchView(nine, matchKey, numHoles, startHole) {
        let html = '<div class="scorecard"><table><tr><th>Hole</th>';
        for (let h = 0; h < numHoles; h++) html += `<th>${startHole + h}</th>`;
        html += '<th>Tot</th></tr><tr><td class="hole-num">W</td>';

        let hsP = 0, jdP = 0;
        for (let h = 0; h < numHoles; h++) {
            const r = scoring.scores.day3[nine][matchKey] ? scoring.scores.day3[nine][matchKey][h] : null;
            let cellVal = '', cellClass = '';
            if (r === 'hs') { cellVal = 'HS'; cellClass = 'winner-hs'; hsP += 1; }
            else if (r === 'jd') { cellVal = 'JD'; cellClass = 'winner-jd'; jdP += 1; }
            else if (r === 'halve') { cellVal = '-'; cellClass = 'halved'; hsP += 0.5; jdP += 0.5; }
            html += `<td class="${cellClass}">${cellVal}</td>`;
        }
        html += `<td></td></tr></table></div>`;
        html += `<div class="match-status"><span class="hs-pts">HS: ${hsP}</span><span class="jd-pts">JD: ${jdP}</span></div>`;
        return html;
    }

    window.renderAll = renderAll;
    renderAll();
});
