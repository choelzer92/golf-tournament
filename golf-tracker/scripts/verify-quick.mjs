// verify:quick — the PER-COMMIT tier of the gate (verify speed, option B).
//
//   tsc → unit tests → only the e2e specs that touch what changed on this branch.
//
// `npm run verify` stays the full gate (tsc → build → unit → EVERY spec) and runs ONCE
// before handoff. This tier skips `next build` and the unrelated specs, so it can miss a
// regression on a screen the change reaches only by a click-through — that's what the
// full gate is for.
//
// Which specs: diff = committed changes since the branch left main + uncommitted +
// untracked files. Then
//   1. a changed spec runs itself;
//   2. a changed page/layout under src/app maps to its route, and every spec that names
//      that route runs (`/pool/new`, `/leaderboard`, `/home/stats` …);
//   3. any changed src file also maps to every app route that imports it, transitively
//      (by module name), then as (2).
// Extra specs can be named on the command line: `npm run verify:quick -- e2e/foo.spec.ts`;
// `-- --list` prints the pick without running anything.
// A changed src file that maps to no spec is PRINTED, never silently dropped.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, basename, extname, dirname } from 'node:path';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const posix = (p) => p.split(sep).join('/');

function run(label, cmd, args, env = {}) {
  console.log(`\n▶ ${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\n✘ verify:quick failed at ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(posix(p));
  }
  return out;
}

// ── what changed ──
// VQ_BASE overrides the base (e.g. `VQ_BASE=HEAD~1` to check just the last commit's pick).
const base = process.env.VQ_BASE ?? sh('git merge-base HEAD main');
const changed = new Set([
  ...sh(`git diff --relative --name-only ${base}`).split('\n'),
  ...sh('git ls-files --others --exclude-standard').split('\n'),
].filter((f) => f && existsSync(f)));

const specs = walk('e2e').filter((f) => f.endsWith('.spec.ts'));
const specText = new Map(specs.map((f) => [f, readFileSync(f, 'utf8')]));
const srcFiles = walk('src').filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/\.test\.tsx?$/.test(f));
const srcText = new Map(srcFiles.map((f) => [f, readFileSync(f, 'utf8')]));

// A file under src/app belongs to the nearest directory at or above it holding a page
// (`panels/`, `steps/` are not routes). Returns that directory's route token:
// pool/[id]/leaderboard → '/leaderboard'; pool/new → '/pool/new'; pool/[id] → '/pool/'.
// The token is the static tail after the last dynamic segment (or the static head when
// the route ends in one) — what a spec's goto / goToGame(…, '/leaderboard') contains.
function routeToken(appFile) {
  let dir = dirname(appFile);
  while (dir.startsWith('src/app') && !readdirSync(dir).some((n) => /^page\./.test(n))) dir = posix(dirname(dir));
  if (!dir.startsWith('src/app')) return null;
  const segs = posix(relative('src/app', dir)).split('/')
    .filter((s) => s && s !== '.' && !/^\(.*\)$/.test(s));
  if (segs.length === 0) return null;                     // the root page — too broad
  const lastDyn = segs.findLastIndex((s) => s.startsWith('['));
  if (lastDyn === -1) return '/' + segs.join('/');
  if (lastDyn === segs.length - 1) {
    const head = segs.slice(0, lastDyn);
    return head.length ? '/' + head.join('/') + '/' : null;
  }
  return '/' + segs.slice(lastDyn + 1).join('/');
}

// Every src/app file that reaches `file` through imports (transitive, by module name —
// `game-modes/index.ts` is imported as `…/game-modes`).
function appFilesReaching(file) {
  const seen = new Set([file]);
  const queue = [file];
  while (queue.length) {
    const f = queue.shift();
    let mod = basename(f, extname(f));
    if (mod === 'index') mod = basename(dirname(f));
    const esc = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`from ['"](?:[^'"]*/)?${esc}['"]`);
    for (const g of srcFiles) {
      if (!seen.has(g) && re.test(srcText.get(g))) { seen.add(g); queue.push(g); }
    }
  }
  return [...seen].filter((f) => f.startsWith('src/app/'));
}

const listOnly = process.argv.includes('--list');     // print the spec pick, run nothing
const picked = new Set(process.argv.slice(2).filter((a) => a !== '--list').map(posix));
const unmapped = [];
for (const f of changed) {
  if (f.startsWith('e2e/') && f.endsWith('.spec.ts')) { picked.add(f); continue; }
  if (!f.startsWith('src/') || !/\.(tsx?|jsx?)$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
  const routes = f.startsWith('src/app/') ? [f, ...appFilesReaching(f)] : appFilesReaching(f);
  const tokens = [...new Set(routes.map(routeToken).filter(Boolean))];
  const hits = specs.filter((s) => tokens.some((t) => specText.get(s).includes(t)));
  if (hits.length === 0) unmapped.push(f);
  hits.forEach((s) => picked.add(s));
}

// ── the gate ──
// Past this many specs the one-time sandbox build pays for itself (§5.bz).
const PROD_PICK = 25;
if (listOnly) {
  console.log([...picked].sort().join('\n') || '(no specs)');
  if (unmapped.length) console.log('unmapped:\n   ' + unmapped.join('\n   '));
  process.exit(0);
}
run('typecheck', 'npx', ['tsc', '--noEmit']);
run('unit', 'npx', ['vitest', 'run']);
if (unmapped.length) {
  console.log('\n⚠ changed src files no spec maps to (the full gate still covers them):');
  unmapped.forEach((f) => console.log('   ' + f));
}
if (picked.size === 0) {
  console.log('\n✓ verify:quick — no e2e spec touches this diff (tsc + unit green)');
  process.exit(0);
}
console.log(`\n${picked.size} spec(s):\n   ${[...picked].sort().join('\n   ')}`);
// §5.bz: a big pick (a shared lib changed, so most specs run) pays one sandbox build and runs on
// the production-mode server with 3 workers; a small pick stays on `next dev`, which compiles
// only the routes it visits. PW_SERVER set by hand wins.
const server = process.env.PW_SERVER ?? (picked.size > PROD_PICK ? 'prod' : 'dev');
console.log(`e2e server: ${server}${server === 'prod' ? ' (sandbox build, 3 workers)' : ' (next dev)'}`);
run('e2e', 'npx', ['playwright', 'test', ...[...picked].sort()], { PW_SERVER: server, PW_REPORTER: 'dot' });
console.log('\n✓ verify:quick green');
