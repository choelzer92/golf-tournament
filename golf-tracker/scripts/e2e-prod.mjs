// The full gate's e2e step (§5.bz): Playwright against the production-mode sandbox build.
// A node wrapper because npm runs scripts under cmd.exe on Windows, where `VAR=1 cmd` fails.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { PW_REPORTER: 'dot', ...process.env, PW_SERVER: 'prod' },
});
process.exit(r.status ?? 1);
