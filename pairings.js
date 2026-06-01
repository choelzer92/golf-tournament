const PAIRINGS_KEY = 'golf-tournament-2026-pairings';

function getDefaultPairings() {
    return {
        day1: {
            matches: [
                { hs: ["bodner", "keith"], jd: ["craig", "casey"] },
                { hs: ["burns", "smith"], jd: ["enterlin", "lacy"] }
            ]
        },
        day3: {
            front: [
                { hs: ["bodner", "smith"], jd: ["craig", "lacy"] },
                { hs: ["burns", "ross"], jd: ["enterlin", "casey"] }
            ],
            back: [
                { hs: "bodner", jd: "craig" },
                { hs: "smith", jd: "lacy" },
                { hs: "burns", jd: "enterlin" },
                { hs: "ross", jd: "casey" }
            ]
        }
    };
}

function loadPairings() {
    const saved = localStorage.getItem(PAIRINGS_KEY);
    if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
    }
    return getDefaultPairings();
}

function savePairings(pairings) {
    localStorage.setItem(PAIRINGS_KEY, JSON.stringify(pairings));
    if (window.firebaseSavePairings) {
        window.firebaseSavePairings(pairings);
    }
}

function applyPairings() {
    const p = loadPairings();
    CONFIG.days.day1.matches[0].hs = p.day1.matches[0].hs;
    CONFIG.days.day1.matches[0].jd = p.day1.matches[0].jd;
    CONFIG.days.day1.matches[1].hs = p.day1.matches[1].hs;
    CONFIG.days.day1.matches[1].jd = p.day1.matches[1].jd;
    CONFIG.days.day3.front.matches[0].hs = p.day3.front[0].hs;
    CONFIG.days.day3.front.matches[0].jd = p.day3.front[0].jd;
    CONFIG.days.day3.front.matches[1].hs = p.day3.front[1].hs;
    CONFIG.days.day3.front.matches[1].jd = p.day3.front[1].jd;
    CONFIG.days.day3.back.matches[0].hs = p.day3.back[0].hs;
    CONFIG.days.day3.back.matches[0].jd = p.day3.back[0].jd;
    CONFIG.days.day3.back.matches[1].hs = p.day3.back[1].hs;
    CONFIG.days.day3.back.matches[1].jd = p.day3.back[1].jd;
    CONFIG.days.day3.back.matches[2].hs = p.day3.back[2].hs;
    CONFIG.days.day3.back.matches[2].jd = p.day3.back[2].jd;
    CONFIG.days.day3.back.matches[3].hs = p.day3.back[3].hs;
    CONFIG.days.day3.back.matches[3].jd = p.day3.back[3].jd;
}

function updateMatchHeaders() {
    const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
    const fmt = (keys) => keys.map(k => {
        const p = allPlayers[k];
        const last = p.name.split(' ').pop();
        return `${last} (${Math.round(p.index)})`;
    }).join(' + ');
    const fmtSingle = (k) => allPlayers[k].name.split(' ').pop();

    // Day 1 match headers
    for (let m = 0; m < 2; m++) {
        const match = CONFIG.days.day1.matches[m];
        const el = document.getElementById(`d1-match${m + 1}-teams`);
        if (el) {
            el.innerHTML = `<span class="team-label hs">${fmt(match.hs)}</span><span class="vs-small">vs</span><span class="team-label jd">${fmt(match.jd)}</span>`;
        }
    }

    // Day 3 front match headers (also serves as group header in scorer mode)
    for (let m = 0; m < 2; m++) {
        const match = CONFIG.days.day3.front.matches[m];
        const el = document.getElementById(`d3-front-match${m + 1}-teams`);
        if (el) {
            el.innerHTML = `<span class="team-label hs">${fmt(match.hs)}</span><span class="vs-small">vs</span><span class="team-label jd">${fmt(match.jd)}</span>`;
        }
        const headerEl = document.getElementById(`d3-front-match${m + 1}-header`);
        if (headerEl) {
            headerEl.textContent = `Group ${m + 1}`;
        }
    }

    // Day 3 back match headers
    for (let m = 0; m < 4; m++) {
        const match = CONFIG.days.day3.back.matches[m];
        const el = document.getElementById(`d3-back-match${m + 1}-header`);
        if (el) {
            el.textContent = `Match ${m + 1}: ${fmtSingle(match.hs)} vs ${fmtSingle(match.jd)}`;
        }
    }
}

let handicapMode = 'course'; // 'course' or 'index'

function renderHandicapComparison() {
    const container = document.getElementById('handicap-comparison');
    if (!container) return;

    const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
    const hsKeys = Object.keys(CONFIG.teams.hogSuckers.players);
    const jdKeys = Object.keys(CONFIG.teams.junkyardDawgs.players);
    const playerKeys = [...hsKeys, ...jdKeys];

    const courses = [
        { key: 'oldTrail', label: 'Old Trail', allowance: CONFIG.days.day1.allowance },
        { key: 'springCreek', label: 'Spring Creek', allowance: CONFIG.days.day2.allowance },
        { key: 'glenmore', label: 'Glenmore F9', allowance: CONFIG.days.day3.front.allowance },
        { key: 'glenmore', label: 'Glenmore B9', allowance: CONFIG.days.day3.back.allowance }
    ];

    const useIndex = handicapMode === 'index';
    const modeLabel = useIndex ? 'Player Index' : 'Course Handicap';
    const altLabel = useIndex ? 'Course Handicap' : 'Player Index';

    let html = '<div class="handicap-compare-card">';
    html += '<div class="hcap-toggle-row">';
    html += `<span class="hcap-mode-label">Using: <b>${modeLabel}</b></span>`;
    html += `<button id="hcap-toggle-btn" class="hcap-toggle-btn">Switch to ${altLabel}</button>`;
    html += '</div>';

    html += '<table class="handicap-compare-table">';
    html += '<thead><tr><th>Player</th><th>Index</th>';
    courses.forEach(c => {
        html += `<th>${c.label}<br><span class="hcap-mult">${Math.round(c.allowance * 100)}%</span></th>`;
    });
    html += '</tr></thead><tbody>';

    playerKeys.forEach(key => {
        const player = allPlayers[key];
        const isJD = jdKeys.includes(key);
        const rowClass = isJD ? ' class="jd-row"' : '';

        html += `<tr${rowClass}>`;
        html += `<td>${player.name}</td>`;
        html += `<td>${player.index}</td>`;

        courses.forEach(c => {
            const course = CONFIG.courses[c.key];
            const rawCourse = calcCourseHandicap(player.index, course.slope, course.rating, course.par);
            const adjusted = Math.round(rawCourse * c.allowance);

            if (useIndex) {
                const adjustedIndex = Math.round(player.index * c.allowance * 10) / 10;
                html += `<td><span class="hcap-val">${adjustedIndex}</span><span class="hcap-sub">adj idx</span></td>`;
            } else {
                html += `<td><span class="hcap-val">${adjusted}</span><span class="hcap-sub">raw ${rawCourse}</span></td>`;
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table>';

    // Differences section - show matchup diffs for each day
    html += '<div class="hcap-diffs">';
    html += '<h4>Matchup Stroke Differences</h4>';
    const pairings = loadPairings();

    // Day 1
    html += '<div class="hcap-diff-day"><b>Day 1 - Old Trail (100%)</b>';
    pairings.day1.matches.forEach((match, i) => {
        html += renderMatchDiffs(match.hs, match.jd, 'oldTrail', CONFIG.days.day1.allowance, allPlayers, useIndex, `Match ${i + 1}`);
    });
    html += '</div>';

    // Day 3 Front
    html += '<div class="hcap-diff-day"><b>Day 3 Front - Glenmore (90%)</b>';
    pairings.day3.front.forEach((match, i) => {
        html += renderMatchDiffs(match.hs, match.jd, 'glenmore', CONFIG.days.day3.front.allowance, allPlayers, useIndex, `Match ${String.fromCharCode(65 + i)}`);
    });
    html += '</div>';

    // Day 3 Back
    html += '<div class="hcap-diff-day"><b>Day 3 Back - Glenmore (100% diff)</b>';
    pairings.day3.back.forEach((match, i) => {
        const hs = typeof match.hs === 'string' ? [match.hs] : match.hs;
        const jd = typeof match.jd === 'string' ? [match.jd] : match.jd;
        html += renderMatchDiffs(hs, jd, 'glenmore', CONFIG.days.day3.back.allowance, allPlayers, useIndex, `Match ${i + 1}`);
    });
    html += '</div>';

    html += '</div>';
    html += '</div>';

    container.innerHTML = html;

    document.getElementById('hcap-toggle-btn').addEventListener('click', () => {
        handicapMode = handicapMode === 'course' ? 'index' : 'course';
        renderHandicapComparison();
    });
}

function renderMatchDiffs(hsKeys, jdKeys, courseKey, allowance, allPlayers, useIndex, label) {
    const course = CONFIG.courses[courseKey];

    function getVal(playerKey) {
        const p = allPlayers[playerKey];
        if (useIndex) {
            return Math.round(p.index * allowance * 10) / 10;
        }
        return Math.round(calcCourseHandicap(p.index, course.slope, course.rating, course.par) * allowance);
    }

    let html = `<div class="hcap-diff-match"><span class="hcap-diff-label">${label}:</span> `;

    if (hsKeys.length === 1 && jdKeys.length === 1) {
        const hsVal = getVal(hsKeys[0]);
        const jdVal = getVal(jdKeys[0]);
        const diff = Math.abs(hsVal - jdVal);
        const higher = hsVal > jdVal ? allPlayers[hsKeys[0]].name.split(' ').pop() : allPlayers[jdKeys[0]].name.split(' ').pop();
        const strokes = Math.round(diff);
        html += `<span class="hs-name">${allPlayers[hsKeys[0]].name.split(' ').pop()} (${hsVal})</span>`;
        html += ` vs `;
        html += `<span class="jd-name">${allPlayers[jdKeys[0]].name.split(' ').pop()} (${jdVal})</span>`;
        html += ` &mdash; <b>${strokes} strokes</b> to ${higher}`;
    } else {
        const hsVals = hsKeys.map(k => ({ key: k, val: getVal(k) }));
        const jdVals = jdKeys.map(k => ({ key: k, val: getVal(k) }));
        const hsTotal = hsVals.reduce((s, v) => s + v.val, 0);
        const jdTotal = jdVals.reduce((s, v) => s + v.val, 0);
        const hsNames = hsVals.map(v => `${allPlayers[v.key].name.split(' ').pop()} (${v.val})`).join(' + ');
        const jdNames = jdVals.map(v => `${allPlayers[v.key].name.split(' ').pop()} (${v.val})`).join(' + ');
        html += `<span class="hs-name">${hsNames}</span> vs <span class="jd-name">${jdNames}</span>`;
        html += ` &mdash; combined: ${Math.round(hsTotal)} vs ${Math.round(jdTotal)}`;
    }

    html += '</div>';
    return html;
}

function renderPairingsPage() {
    const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
    const pairings = loadPairings();
    const container = document.getElementById('pairings-content');

    let html = '';

    // Day 1
    html += '<div class="pairings-day"><h3>Day 1 - Old Trail</h3>';
    html += '<p class="pairings-format">2v2 Combined Stableford</p>';
    for (let m = 0; m < 2; m++) {
        const match = pairings.day1.matches[m];
        html += `<div class="pairings-match" data-day="1" data-match="${m}">`;
        html += `<div class="pairings-match-header">Match ${m + 1}</div>`;
        html += '<div class="pairings-teams">';
        html += renderTeamSlots('hs', match.hs, allPlayers, `d1m${m}`);
        html += '<div class="pairings-vs">vs</div>';
        html += renderTeamSlots('jd', match.jd, allPlayers, `d1m${m}`);
        html += '</div></div>';
    }
    html += '</div>';

    // Day 2 - no pairings needed (all 8 play together)
    html += '<div class="pairings-day"><h3>Day 2 - Spring Creek</h3>';
    html += '<p class="pairings-format">All players play together (no pairings needed)</p></div>';

    // Day 3 Front
    html += '<div class="pairings-day"><h3>Day 3 Front 9 - Glenmore</h3>';
    html += '<p class="pairings-format">2v2 Best Ball Match Play</p>';
    for (let m = 0; m < 2; m++) {
        const match = pairings.day3.front[m];
        html += `<div class="pairings-match" data-day="3f" data-match="${m}">`;
        html += `<div class="pairings-match-header">Match ${String.fromCharCode(65 + m)}</div>`;
        html += '<div class="pairings-teams">';
        html += renderTeamSlots('hs', match.hs, allPlayers, `d3f${m}`);
        html += '<div class="pairings-vs">vs</div>';
        html += renderTeamSlots('jd', match.jd, allPlayers, `d3f${m}`);
        html += '</div></div>';
    }
    html += '</div>';

    // Day 3 Back
    html += '<div class="pairings-day"><h3>Day 3 Back 9 - Glenmore</h3>';
    html += '<p class="pairings-format">1v1 Match Play</p>';
    for (let m = 0; m < 4; m++) {
        const match = pairings.day3.back[m];
        html += `<div class="pairings-match" data-day="3b" data-match="${m}">`;
        html += `<div class="pairings-match-header">Match ${m + 1}</div>`;
        html += '<div class="pairings-teams">';
        html += renderTeamSlots('hs', [match.hs], allPlayers, `d3b${m}`);
        html += '<div class="pairings-vs">vs</div>';
        html += renderTeamSlots('jd', [match.jd], allPlayers, `d3b${m}`);
        html += '</div></div>';
    }
    html += '</div>';

    html += '<div class="pairings-actions">';
    html += '<button id="pairings-save-btn" class="pairings-save-btn">Save Pairings</button>';
    html += '<button id="pairings-reset-btn" class="pairings-reset-btn">Reset to Default</button>';
    html += '</div>';

    container.innerHTML = html;
    attachPairingsEvents(container, pairings, allPlayers);
    renderHandicapComparison();
}

function renderTeamSlots(team, players, allPlayers, prefix) {
    const teamClass = team === 'hs' ? 'pairings-hs' : 'pairings-jd';
    const teamPlayers = team === 'hs' ? CONFIG.teams.hogSuckers.players : CONFIG.teams.junkyardDawgs.players;
    let html = `<div class="pairings-team-col ${teamClass}">`;
    for (let i = 0; i < players.length; i++) {
        const playerKey = players[i];
        const player = allPlayers[playerKey];
        html += `<div class="pairings-slot" data-prefix="${prefix}" data-team="${team}" data-slot="${i}">`;
        html += `<select class="pairings-select" data-prefix="${prefix}" data-team="${team}" data-slot="${i}">`;
        for (const [key, p] of Object.entries(teamPlayers)) {
            const selected = key === playerKey ? ' selected' : '';
            html += `<option value="${key}"${selected}>${p.name} (${p.index})</option>`;
        }
        html += '</select></div>';
    }
    html += '</div>';
    return html;
}

function attachPairingsEvents(container, pairings, allPlayers) {
    container.querySelectorAll('.pairings-select').forEach(select => {
        select.addEventListener('change', () => {
            // Mark unsaved changes
            document.getElementById('pairings-save-btn').classList.add('unsaved');
        });
    });

    document.getElementById('pairings-save-btn').addEventListener('click', async () => {
        const pin = prompt('Enter PIN to save pairings:');
        if (!pin) return;
        const valid = await attemptLogin(pin);
        if (!valid) {
            alert('Invalid PIN');
            return;
        }
        if (!confirm('Are you sure you want to change the pairings? This will affect all scoring.')) return;

        const updated = readPairingsFromUI();
        savePairings(updated);
        applyPairings();
        document.getElementById('pairings-save-btn').classList.remove('unsaved');
        if (window.renderAll) window.renderAll();
        alert('Pairings saved!');
    });

    document.getElementById('pairings-reset-btn').addEventListener('click', async () => {
        const pin = prompt('Enter PIN to reset pairings:');
        if (!pin) return;
        const valid = await attemptLogin(pin);
        if (!valid) {
            alert('Invalid PIN');
            return;
        }
        if (!confirm('Reset all pairings to defaults?')) return;

        const defaults = getDefaultPairings();
        savePairings(defaults);
        applyPairings();
        renderPairingsPage();
        if (window.renderAll) window.renderAll();
        alert('Pairings reset to defaults!');
    });
}

function readPairingsFromUI() {
    const pairings = { day1: { matches: [{}, {}] }, day3: { front: [{}, {}], back: [{}, {}, {}, {}] } };

    // Day 1
    for (let m = 0; m < 2; m++) {
        pairings.day1.matches[m].hs = getSelectValues(`d1m${m}`, 'hs');
        pairings.day1.matches[m].jd = getSelectValues(`d1m${m}`, 'jd');
    }

    // Day 3 Front
    for (let m = 0; m < 2; m++) {
        pairings.day3.front[m].hs = getSelectValues(`d3f${m}`, 'hs');
        pairings.day3.front[m].jd = getSelectValues(`d3f${m}`, 'jd');
    }

    // Day 3 Back
    for (let m = 0; m < 4; m++) {
        const hsVals = getSelectValues(`d3b${m}`, 'hs');
        const jdVals = getSelectValues(`d3b${m}`, 'jd');
        pairings.day3.back[m].hs = hsVals[0];
        pairings.day3.back[m].jd = jdVals[0];
    }

    return pairings;
}

function getSelectValues(prefix, team) {
    const selects = document.querySelectorAll(`.pairings-select[data-prefix="${prefix}"][data-team="${team}"]`);
    return Array.from(selects).map(s => s.value);
}
