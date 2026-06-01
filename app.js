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

    function renderDay1() {
        for (const matchIdx of [1, 2]) {
            const matchKey = `match${matchIdx}`;
            const matchEl = document.getElementById(`d1-${matchKey}`);
            const container = matchEl.querySelector('.scorecard-container');
            const match = CONFIG.days.day1.matches[matchIdx - 1];
            const course = CONFIG.courses[CONFIG.days.day1.course];

            let html = '<div class="scorecard"><table><tr><th>Hole</th>';
            for (let h = 1; h <= 18; h++) html += `<th>${h}</th>`;
            html += '<th>Tot</th></tr>';

            // HS row (combined stableford)
            html += `<tr><td class="hole-num" style="color:var(--hs-color)">HS</td>`;
            let hsTotal = 0;
            for (let h = 0; h < 18; h++) {
                const scores = scoring.scores.day1[matchKey];
                let cellVal = '';
                if (scores && scores.hs && scores.hs[h]) {
                    let combined = 0;
                    for (let p = 0; p < 2; p++) {
                        if (scores.hs[h][p] !== null) {
                            const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                            const strokes = getStrokesOnHole(hcap, course.strokeIndex[h]);
                            combined += scoring.stablefordPoints(scores.hs[h][p], course.pars[h], strokes);
                        }
                    }
                    cellVal = combined;
                    hsTotal += combined;
                }
                html += `<td class="hs-score">${cellVal}</td>`;
            }
            html += `<td class="hs-score"><b>${hsTotal}</b></td></tr>`;

            // JD row
            html += `<tr><td class="hole-num" style="color:var(--jd-color)">JD</td>`;
            let jdTotal = 0;
            for (let h = 0; h < 18; h++) {
                const scores = scoring.scores.day1[matchKey];
                let cellVal = '';
                if (scores && scores.jd && scores.jd[h]) {
                    let combined = 0;
                    for (let p = 0; p < 2; p++) {
                        if (scores.jd[h][p] !== null) {
                            const hcap = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                            const strokes = getStrokesOnHole(hcap, course.strokeIndex[h]);
                            combined += scoring.stablefordPoints(scores.jd[h][p], course.pars[h], strokes);
                        }
                    }
                    cellVal = combined;
                    jdTotal += combined;
                }
                html += `<td class="jd-score">${cellVal}</td>`;
            }
            html += `<td class="jd-score"><b>${jdTotal}</b></td></tr>`;

            // Result row
            html += '<tr><td class="hole-num">Pts</td>';
            let hsMatchPts = 0, jdMatchPts = 0;
            for (let h = 0; h < 18; h++) {
                const scores = scoring.scores.day1[matchKey];
                let cellVal = '';
                let cellClass = '';
                if (scores && scores.hs && scores.hs[h] && scores.jd && scores.jd[h]) {
                    let hsS = 0, jdS = 0;
                    for (let p = 0; p < 2; p++) {
                        if (scores.hs[h][p] !== null) {
                            const hcap = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                            hsS += scoring.stablefordPoints(scores.hs[h][p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                        }
                        if (scores.jd[h][p] !== null) {
                            const hcap = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                            jdS += scoring.stablefordPoints(scores.jd[h][p], course.pars[h], getStrokesOnHole(hcap, course.strokeIndex[h]));
                        }
                    }
                    if (hsS > jdS) { cellVal = 'HS'; cellClass = 'winner-hs'; hsMatchPts += 1; }
                    else if (jdS > hsS) { cellVal = 'JD'; cellClass = 'winner-jd'; jdMatchPts += 1; }
                    else { cellVal = '-'; cellClass = 'halved'; hsMatchPts += 0.5; jdMatchPts += 0.5; }
                }
                html += `<td class="${cellClass}">${cellVal}</td>`;
            }
            html += '<td></td></tr>';
            html += '</table></div>';

            html += `<div class="match-status">
                <span class="hs-pts">HS: ${hsMatchPts}</span>
                <span>of 18</span>
                <span class="jd-pts">JD: ${jdMatchPts}</span>
            </div>`;

            container.innerHTML = html;
        }

        // Individual leader
        const indResult = scoring.calcDay1Individual();
        const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
        if (indResult.player) {
            const playerName = allPlayers[indResult.player].name;
            const teamLabel = indResult.team === 'hs' ? 'Hog Suckers' : 'Junkyard Dawgs';
            document.getElementById('d1-individual-leader').textContent =
                `${playerName} (${teamLabel}) - ${indResult.total} pts`;
        }
    }

    function renderDay2() {
        const container = document.querySelector('#d2-team .scorecard-container');
        const d2 = scoring.calcDay2();
        const scoring2 = CONFIG.days.day2.scoring;

        let html = `<div class="match-status">
            <div>
                <div class="hs-pts">Front: ${d2.hsFront >= 0 ? '+' : ''}${d2.hsFront}</div>
                <div class="hs-pts">Back: ${d2.hsBack >= 0 ? '+' : ''}${d2.hsBack}</div>
                <div class="hs-pts"><b>Total: ${d2.hsPoints} pts</b></div>
            </div>
            <div style="text-align:center;font-size:11px;color:#666">
                F9: ${scoring2.front} | B9: ${scoring2.back} | OA: ${scoring2.overall}
            </div>
            <div style="text-align:right">
                <div class="jd-pts">Front: ${d2.jdFront >= 0 ? '+' : ''}${d2.jdFront}</div>
                <div class="jd-pts">Back: ${d2.jdBack >= 0 ? '+' : ''}${d2.jdBack}</div>
                <div class="jd-pts"><b>Total: ${d2.jdPoints} pts</b></div>
            </div>
        </div>`;

        container.innerHTML = html;

        document.getElementById('d2-junk-hs').textContent = scoring.scores.day2.junk.hs || 0;
        document.getElementById('d2-junk-jd').textContent = scoring.scores.day2.junk.jd || 0;
    }

    function renderDay3() {
        // Front 9
        for (let m = 1; m <= 2; m++) {
            const matchEl = document.getElementById(`d3-front-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;
            let hsP = 0, jdP = 0;

            let html = '<div class="scorecard"><table><tr><th>Hole</th>';
            for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
            html += '<th>Tot</th></tr><tr><td class="hole-num">Result</td>';

            for (let h = 0; h < 9; h++) {
                const r = scoring.scores.day3.front[matchKey] ? scoring.scores.day3.front[matchKey][h] : null;
                let cellVal = '', cellClass = '';
                if (r === 'hs') { cellVal = 'HS'; cellClass = 'winner-hs'; hsP += 1; }
                else if (r === 'jd') { cellVal = 'JD'; cellClass = 'winner-jd'; jdP += 1; }
                else if (r === 'halve') { cellVal = '-'; cellClass = 'halved'; hsP += 0.5; jdP += 0.5; }
                html += `<td class="${cellClass}">${cellVal}</td>`;
            }
            html += `<td></td></tr></table></div>`;
            html += `<div class="match-status"><span class="hs-pts">HS: ${hsP}</span><span class="jd-pts">JD: ${jdP}</span></div>`;
            container.innerHTML = html;
        }

        // Back 9
        for (let m = 1; m <= 4; m++) {
            const matchEl = document.getElementById(`d3-back-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;
            let hsP = 0, jdP = 0;

            let html = '<div class="scorecard"><table><tr><th>Hole</th>';
            for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
            html += '<th>Tot</th></tr><tr><td class="hole-num">Result</td>';

            for (let h = 0; h < 9; h++) {
                const r = scoring.scores.day3.back[matchKey] ? scoring.scores.day3.back[matchKey][h] : null;
                let cellVal = '', cellClass = '';
                if (r === 'hs') { cellVal = 'HS'; cellClass = 'winner-hs'; hsP += 1; }
                else if (r === 'jd') { cellVal = 'JD'; cellClass = 'winner-jd'; jdP += 1; }
                else if (r === 'halve') { cellVal = '-'; cellClass = 'halved'; hsP += 0.5; jdP += 0.5; }
                html += `<td class="${cellClass}">${cellVal}</td>`;
            }
            html += `<td></td></tr></table></div>`;
            html += `<div class="match-status"><span class="hs-pts">HS: ${hsP}</span><span class="jd-pts">JD: ${jdP}</span></div>`;
            container.innerHTML = html;
        }
    }

    window.renderAll = renderAll;

    // Initial render
    renderAll();
});
