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
                container.innerHTML = renderHoleByScorerDay1(matchKey, holeKey, match, course);
                attachDay1ScorerEvents(matchKey, holeKey, match, course);
            } else {
                container.innerHTML = renderDay1Summary(matchKey, match, course);
            }
        }

        const indResult = scoring.calcDay1Individual();
        if (indResult.player && indResult.total > 0) {
            const playerName = allPlayers[indResult.player].name;
            const teamLabel = indResult.team === 'hs' ? 'Hog Suckers' : 'Junkyard Dawgs';
            document.getElementById('d1-individual-leader').innerHTML =
                `<span class="${indResult.team === 'hs' ? 'hs-pts' : 'jd-pts'}">${playerName} - ${indResult.total} pts (${teamLabel})</span>`;
        }
    }

    function renderHoleByScorerDay1(matchKey, holeKey, match, course) {
        const hole = currentHole[holeKey];
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const scores = scoring.scores.day1[matchKey];
        const hsHole = (scores.hs && scores.hs[hole]) || [null, null];
        const jdHole = (scores.jd && scores.jd[hole]) || [null, null];

        let html = '';

        // Hole navigation
        html += `<div class="hole-nav">
            <button class="hole-nav-btn prev" data-key="${holeKey}" ${hole === 0 ? 'disabled' : ''}>&lt;</button>
            <div class="hole-info">
                <span class="hole-number">Hole ${hole + 1}</span>
                <span class="hole-par">Par ${par} | SI ${strokeIdx}</span>
            </div>
            <button class="hole-nav-btn next" data-key="${holeKey}" ${hole === 17 ? 'disabled' : ''}>&gt;</button>
        </div>`;

        // Hole progress dots
        html += '<div class="hole-dots">';
        for (let h = 0; h < 18; h++) {
            const hsH = (scores.hs && scores.hs[h]) || [null, null];
            const jdH = (scores.jd && scores.jd[h]) || [null, null];
            const filled = hsH[0] !== null && hsH[1] !== null && jdH[0] !== null && jdH[1] !== null;
            html += `<span class="dot ${filled ? 'filled' : ''} ${h === hole ? 'current' : ''}" data-key="${holeKey}" data-hole="${h}"></span>`;
        }
        html += '</div>';

        // Player score inputs
        html += '<div class="player-scores">';

        // HS team
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
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(matchKey, 'hs', hole, p, currentVal, par)}
                </div>
                <div class="stableford-result ${stableford !== null ? 'visible' : ''}">
                    ${stableford !== null ? stableford + ' pts' : ''}
                </div>
            </div>`;
        }
        html += '</div>';

        // JD team
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
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtons(matchKey, 'jd', hole, p, currentVal, par)}
                </div>
                <div class="stableford-result ${stableford !== null ? 'visible' : ''}">
                    ${stableford !== null ? stableford + ' pts' : ''}
                </div>
            </div>`;
        }
        html += '</div>';
        html += '</div>';

        // Hole result
        if (hsHole[0] !== null && hsHole[1] !== null && jdHole[0] !== null && jdHole[1] !== null) {
            let hsS = 0, jdS = 0;
            for (let p = 0; p < 2; p++) {
                const hcapH = getPlayerCourseHcap(match.hs[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                hsS += scoring.stablefordPoints(hsHole[p], par, getStrokesOnHole(hcapH, strokeIdx));
                const hcapJ = getPlayerCourseHcap(match.jd[p], CONFIG.days.day1.course, CONFIG.days.day1.allowance);
                jdS += scoring.stablefordPoints(jdHole[p], par, getStrokesOnHole(hcapJ, strokeIdx));
            }
            let resultClass = 'halve-result';
            let resultText = `Halved (${hsS} - ${jdS})`;
            if (hsS > jdS) { resultClass = 'hs-result'; resultText = `Hog Suckers win (${hsS} - ${jdS})`; }
            else if (jdS > hsS) { resultClass = 'jd-result'; resultText = `Junkyard Dawgs win (${jdS} - ${hsS})`; }
            html += `<div class="hole-result ${resultClass}">${resultText}</div>`;
        }

        // Match running total
        const matchResult = scoring.calcDay1Match(matchKey);
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${matchResult.hsPoints}</span>
            <span>${matchResult.holesPlayed}/18 holes</span>
            <span class="jd-pts">JD: ${matchResult.jdPoints}</span>
        </div>`;

        return html;
    }

    function renderScoreButtons(matchKey, team, hole, playerIdx, currentVal, par) {
        let html = '';
        const scores = [];
        for (let s = Math.max(1, par - 3); s <= par + 4; s++) scores.push(s);

        for (const s of scores) {
            const diff = s - par;
            let label = s.toString();
            let cls = 'score-btn';
            if (diff < -1) cls += ' eagle-btn';
            else if (diff === -1) cls += ' birdie-btn';
            else if (diff === 0) cls += ' par-btn';
            else if (diff === 1) cls += ' bogey-btn';
            else cls += ' dbl-btn';
            if (currentVal === s) cls += ' selected';
            html += `<button class="${cls}" data-match="${matchKey}" data-team="${team}" data-hole="${hole}" data-player="${playerIdx}" data-score="${s}">${label}</button>`;
        }
        return html;
    }

    function attachDay1ScorerEvents(matchKey, holeKey, match, course) {
        // Score buttons
        document.querySelectorAll(`.score-btn[data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);

                if (!scoring.scores.day1[matchKey][team][hole]) {
                    scoring.scores.day1[matchKey][team][hole] = [null, null];
                }
                // Toggle off if same score clicked
                if (scoring.scores.day1[matchKey][team][hole][player] === score) {
                    scoring.scores.day1[matchKey][team][hole][player] = null;
                } else {
                    scoring.scores.day1[matchKey][team][hole][player] = score;
                }
                scoring.saveScores();
                renderAll();
            });
        });

        // Hole navigation
        document.querySelectorAll(`.hole-nav-btn[data-key="${holeKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('prev') && currentHole[holeKey] > 0) currentHole[holeKey]--;
                if (e.target.classList.contains('next') && currentHole[holeKey] < 17) currentHole[holeKey]++;
                renderAll();
            });
        });

        // Dot navigation
        document.querySelectorAll(`.dot[data-key="${holeKey}"]`).forEach(dot => {
            dot.addEventListener('click', (e) => {
                currentHole[holeKey] = parseInt(e.target.dataset.hole);
                renderAll();
            });
        });
    }

    function renderDay1Summary(matchKey, match, course) {
        const matchResult = scoring.calcDay1Match(matchKey);
        let html = '<div class="summary-holes">';

        for (let h = 0; h < 18; h++) {
            const scores = scoring.scores.day1[matchKey];
            let cls = 'summary-hole';
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
                if (hsS > jdS) cls += ' hs-win';
                else if (jdS > hsS) cls += ' jd-win';
                else cls += ' halved';
            }
            html += `<div class="${cls}">${h + 1}</div>`;
        }
        html += '</div>';

        html += `<div class="match-status">
            <span class="hs-pts">HS: ${matchResult.hsPoints}</span>
            <span>${matchResult.holesPlayed}/18</span>
            <span class="jd-pts">JD: ${matchResult.jdPoints}</span>
        </div>`;

        return html;
    }

    // ==================== DAY 2 ====================
    function renderDay2() {
        const container = document.querySelector('#d2-team .scorecard-container');
        const course = CONFIG.courses[CONFIG.days.day2.course];
        const hsPlayers = ['bodner', 'burns', 'smith', 'ross'];
        const jdPlayers = ['craig', 'casey', 'enterlin', 'lacy'];

        if (scorerMode) {
            container.innerHTML = renderHoleByScorerDay2(course, hsPlayers, jdPlayers);
            attachDay2ScorerEvents(course, hsPlayers, jdPlayers);
        } else {
            const d2 = scoring.calcDay2();
            const s2 = CONFIG.days.day2.scoring;
            let html = renderDay2Summary(course, hsPlayers, jdPlayers);
            html += `<div class="match-status">
                <div>
                    <div class="hs-pts">Front: ${d2.hsFront >= 0 ? '+' : ''}${d2.hsFront}</div>
                    <div class="hs-pts">Back: ${d2.hsBack >= 0 ? '+' : ''}${d2.hsBack}</div>
                    <div class="hs-pts"><b>HS: ${d2.hsPoints} pts</b></div>
                </div>
                <div style="text-align:center;font-size:11px;color:#666">
                    F9: ${s2.front} | B9: ${s2.back}<br>OA: ${s2.overall} | Junk: ${s2.junk}
                </div>
                <div style="text-align:right">
                    <div class="jd-pts">Front: ${d2.jdFront >= 0 ? '+' : ''}${d2.jdFront}</div>
                    <div class="jd-pts">Back: ${d2.jdBack >= 0 ? '+' : ''}${d2.jdBack}</div>
                    <div class="jd-pts"><b>JD: ${d2.jdPoints} pts</b></div>
                </div>
            </div>`;
            container.innerHTML = html;
        }

        // Junk
        if (scorerMode) {
            document.getElementById('d2-junk-hs').innerHTML = `<input type="number" class="score-input junk-input" id="junk-hs-input" value="${scoring.scores.day2.junk.hs || 0}" inputmode="numeric" style="width:50px;font-size:20px">`;
            document.getElementById('d2-junk-jd').innerHTML = `<input type="number" class="score-input junk-input" id="junk-jd-input" value="${scoring.scores.day2.junk.jd || 0}" inputmode="numeric" style="width:50px;font-size:20px">`;
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

    function renderHoleByScorerDay2(course, hsPlayers, jdPlayers) {
        const hole = currentHole.day2;
        const par = course.pars[hole];
        const strokeIdx = course.strokeIndex[hole];
        const hsHole = scoring.scores.day2.hs[hole] || [null, null, null, null];
        const jdHole = scoring.scores.day2.jd[hole] || [null, null, null, null];

        let html = '';

        // Hole navigation
        html += `<div class="hole-nav">
            <button class="hole-nav-btn prev" data-key="day2" ${hole === 0 ? 'disabled' : ''}>&lt;</button>
            <div class="hole-info">
                <span class="hole-number">Hole ${hole + 1}</span>
                <span class="hole-par">Par ${par} | SI ${strokeIdx}</span>
            </div>
            <button class="hole-nav-btn next" data-key="day2" ${hole === 17 ? 'disabled' : ''}>&gt;</button>
        </div>`;

        // Progress dots
        html += '<div class="hole-dots">';
        for (let h = 0; h < 18; h++) {
            const hsH = scoring.scores.day2.hs[h] || [null, null, null, null];
            const jdH = scoring.scores.day2.jd[h] || [null, null, null, null];
            const filled = hsH.some(v => v !== null) && jdH.some(v => v !== null);
            html += `<span class="dot ${filled ? 'filled' : ''} ${h === hole ? 'current' : ''}" data-key="day2" data-hole="${h}"></span>`;
        }
        html += '</div>';

        // HS Players
        html += '<div class="player-scores">';
        html += '<div class="team-section hs-section"><div class="team-section-label">Hog Suckers</div>';
        for (let p = 0; p < 4; p++) {
            const playerKey = hsPlayers[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            const currentVal = hsHole[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtonsDay2('hs', hole, p, currentVal, par)}
                </div>
                <div class="stableford-result ${currentVal !== null ? 'visible' : ''}">
                    ${currentVal !== null ? 'G:' + currentVal + ' N:' + netScore : ''}
                </div>
            </div>`;
        }
        html += '</div>';

        // JD Players
        html += '<div class="team-section jd-section"><div class="team-section-label">Junkyard Dawgs</div>';
        for (let p = 0; p < 4; p++) {
            const playerKey = jdPlayers[p];
            const hcap = getPlayerCourseHcap(playerKey, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            const currentVal = jdHole[p];
            const netScore = currentVal !== null ? currentVal - strokes : null;

            html += `<div class="player-row">
                <div class="player-info">
                    <span class="player-name">${allPlayers[playerKey].name}</span>
                    <span class="player-hcap">${hcap} hcp${strokes > 0 ? ' | <b class="stroke-dot">+' + strokes + '</b>' : ''}</span>
                </div>
                <div class="score-buttons">
                    ${renderScoreButtonsDay2('jd', hole, p, currentVal, par)}
                </div>
                <div class="stableford-result ${currentVal !== null ? 'visible' : ''}">
                    ${currentVal !== null ? 'G:' + currentVal + ' N:' + netScore : ''}
                </div>
            </div>`;
        }
        html += '</div>';
        html += '</div>';

        // Hole result
        const hsCalcs = hsPlayers.map((pk, i) => {
            if (hsHole[i] === null) return null;
            const hcap = getPlayerCourseHcap(pk, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            return { gross: hsHole[i], net: hsHole[i] - strokes, player: allPlayers[pk].name };
        }).filter(Boolean);

        const jdCalcs = jdPlayers.map((pk, i) => {
            if (jdHole[i] === null) return null;
            const hcap = getPlayerCourseHcap(pk, CONFIG.days.day2.course, CONFIG.days.day2.allowance);
            const strokes = getStrokesOnHole(hcap, strokeIdx);
            return { gross: jdHole[i], net: jdHole[i] - strokes, player: allPlayers[pk].name };
        }).filter(Boolean);

        if (hsCalcs.length >= 2 && jdCalcs.length >= 2) {
            const bestCombo = (calcs) => {
                let best = { netPlayer: '', grossPlayer: '', netScore: 99, grossScore: 99 };
                for (let i = 0; i < calcs.length; i++) {
                    for (let j = 0; j < calcs.length; j++) {
                        if (i === j) continue;
                        const total = calcs[i].net + calcs[j].gross;
                        if (total < best.netScore + best.grossScore) {
                            best = { netPlayer: calcs[i].player, grossPlayer: calcs[j].player, netScore: calcs[i].net, grossScore: calcs[j].gross };
                        }
                    }
                }
                return best;
            };
            const hsB = bestCombo(hsCalcs);
            const jdB = bestCombo(jdCalcs);

            html += `<div class="hole-breakdown">
                <div class="breakdown-team hs-breakdown">
                    <b>HS:</b> Net ${hsB.netScore} (${hsB.netPlayer.split(' ')[1]}) + Gross ${hsB.grossScore} (${hsB.grossPlayer.split(' ')[1]}) = <b>${hsB.netScore + hsB.grossScore - 2*par >= 0 ? '+' : ''}${hsB.netScore + hsB.grossScore - 2*par}</b>
                </div>
                <div class="breakdown-team jd-breakdown">
                    <b>JD:</b> Net ${jdB.netScore} (${jdB.netPlayer.split(' ')[1]}) + Gross ${jdB.grossScore} (${jdB.grossPlayer.split(' ')[1]}) = <b>${jdB.netScore + jdB.grossScore - 2*par >= 0 ? '+' : ''}${jdB.netScore + jdB.grossScore - 2*par}</b>
                </div>
            </div>`;
        }

        // Running total
        const d2 = scoring.calcDay2();
        html += `<div class="match-status">
            <span class="hs-pts">HS: ${d2.hsFront + d2.hsBack >= 0 ? '+' : ''}${d2.hsFront + d2.hsBack}</span>
            <span>vs par</span>
            <span class="jd-pts">JD: ${d2.jdFront + d2.jdBack >= 0 ? '+' : ''}${d2.jdFront + d2.jdBack}</span>
        </div>`;

        return html;
    }

    function renderScoreButtonsDay2(team, hole, playerIdx, currentVal, par) {
        let html = '';
        const scores = [];
        for (let s = Math.max(1, par - 3); s <= par + 4; s++) scores.push(s);

        for (const s of scores) {
            const diff = s - par;
            let cls = 'score-btn';
            if (diff < -1) cls += ' eagle-btn';
            else if (diff === -1) cls += ' birdie-btn';
            else if (diff === 0) cls += ' par-btn';
            else if (diff === 1) cls += ' bogey-btn';
            else cls += ' dbl-btn';
            if (currentVal === s) cls += ' selected';
            html += `<button class="${cls}" data-day="2" data-team="${team}" data-hole="${hole}" data-player="${playerIdx}" data-score="${s}">${label(s, par)}</button>`;
        }
        return html;
    }

    function label(score, par) {
        return score.toString();
    }

    function attachDay2ScorerEvents(course, hsPlayers, jdPlayers) {
        document.querySelectorAll('.score-btn[data-day="2"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const team = e.target.dataset.team;
                const player = parseInt(e.target.dataset.player);
                const score = parseInt(e.target.dataset.score);

                if (!scoring.scores.day2[team][hole]) {
                    scoring.scores.day2[team][hole] = [null, null, null, null];
                }
                if (scoring.scores.day2[team][hole][player] === score) {
                    scoring.scores.day2[team][hole][player] = null;
                } else {
                    scoring.scores.day2[team][hole][player] = score;
                }
                scoring.saveScores();
                renderAll();
            });
        });

        // Hole navigation
        document.querySelectorAll('.hole-nav-btn[data-key="day2"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('prev') && currentHole.day2 > 0) currentHole.day2--;
                if (e.target.classList.contains('next') && currentHole.day2 < 17) currentHole.day2++;
                renderAll();
            });
        });
        document.querySelectorAll('.dot[data-key="day2"]').forEach(dot => {
            dot.addEventListener('click', (e) => {
                currentHole.day2 = parseInt(e.target.dataset.hole);
                renderAll();
            });
        });
    }

    function renderDay2Summary(course, hsPlayers, jdPlayers) {
        let html = '<div class="summary-holes">';
        for (let h = 0; h < 18; h++) {
            const hsH = scoring.scores.day2.hs[h];
            const jdH = scoring.scores.day2.jd[h];
            let cls = 'summary-hole';
            if (hsH && jdH && hsH.some(v => v !== null) && jdH.some(v => v !== null)) {
                cls += ' filled';
            }
            html += `<div class="${cls}">${h + 1}</div>`;
        }
        html += '</div>';
        return html;
    }

    // ==================== DAY 3 ====================
    function renderDay3() {
        // Front 9 matches
        for (let m = 1; m <= 2; m++) {
            const matchEl = document.getElementById(`d3-front-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;
            const holeKey = `day3f${m}`;

            if (scorerMode) {
                container.innerHTML = renderDay3MatchScorer('front', matchKey, holeKey, 9, 1);
                attachDay3Events('front', matchKey, holeKey, 9);
            } else {
                container.innerHTML = renderDay3MatchView('front', matchKey, 9, 1);
            }
        }

        // Back 9 matches
        for (let m = 1; m <= 4; m++) {
            const matchEl = document.getElementById(`d3-back-match${m}`);
            const container = matchEl.querySelector('.scorecard-container');
            const matchKey = `match${m}`;
            const holeKey = `day3b${m}`;

            if (scorerMode) {
                container.innerHTML = renderDay3MatchScorer('back', matchKey, holeKey, 9, 10);
                attachDay3Events('back', matchKey, holeKey, 9);
            } else {
                container.innerHTML = renderDay3MatchView('back', matchKey, 9, 10);
            }
        }

        // Day 3 totals
        const d3f = scoring.calcDay3Front();
        const d3b = scoring.calcDay3Back();
        const d3Total = document.getElementById('d3-totals');
        if (d3Total) {
            d3Total.innerHTML = `<div class="match-status">
                <span class="hs-pts">HS: ${d3f.hsPoints + d3b.hsPoints}</span>
                <span>of 60</span>
                <span class="jd-pts">JD: ${d3f.jdPoints + d3b.jdPoints}</span>
            </div>`;
        }
    }

    function renderDay3MatchScorer(nine, matchKey, holeKey, numHoles, startHole) {
        let html = '<div class="d3-scorer">';
        for (let h = 0; h < numHoles; h++) {
            const current = scoring.scores.day3[nine][matchKey] ? scoring.scores.day3[nine][matchKey][h] : null;
            html += `<div class="d3-hole-row">
                <span class="hole-num-cell">${startHole + h}</span>
                <button class="d3-btn hs-btn ${current === 'hs' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="hs">HS Win</button>
                <button class="d3-btn halve-btn ${current === 'halve' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="halve">Halve</button>
                <button class="d3-btn jd-btn ${current === 'jd' ? 'selected' : ''}" data-nine="${nine}" data-match="${matchKey}" data-hole="${h}" data-val="jd">JD Win</button>
            </div>`;
        }
        html += '</div>';

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

    function attachDay3Events(nine, matchKey, holeKey, numHoles) {
        document.querySelectorAll(`.d3-btn[data-nine="${nine}"][data-match="${matchKey}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hole = parseInt(e.target.dataset.hole);
                const val = e.target.dataset.val;

                if (!scoring.scores.day3[nine][matchKey]) {
                    scoring.scores.day3[nine][matchKey] = Array(numHoles).fill(null);
                }
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
        let html = '<div class="summary-holes">';
        let hsP = 0, jdP = 0;
        for (let h = 0; h < numHoles; h++) {
            const r = scoring.scores.day3[nine][matchKey] ? scoring.scores.day3[nine][matchKey][h] : null;
            let cls = 'summary-hole';
            if (r === 'hs') { cls += ' hs-win'; hsP += 1; }
            else if (r === 'jd') { cls += ' jd-win'; jdP += 1; }
            else if (r === 'halve') { cls += ' halved'; hsP += 0.5; jdP += 0.5; }
            html += `<div class="${cls}">${startHole + h}</div>`;
        }
        html += '</div>';
        html += `<div class="match-status"><span class="hs-pts">HS: ${hsP}</span><span class="jd-pts">JD: ${jdP}</span></div>`;
        return html;
    }

    window.renderAll = renderAll;
    renderAll();
});
