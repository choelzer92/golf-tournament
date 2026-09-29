import type { NextConfig } from "next";

// The sandbox seed page (src/app/sandbox/page.sandbox.tsx) is a DEV-ONLY UI
// harness. Guarding its render with a flag was not enough: Next still compiled the
// route and shipped its seed logic (fixture players, savePoolGame calls) into
// production JS chunks as unreachable-but-present code. Recognising the
// `.sandbox.tsx` page extension only outside production means the route does not
// exist in a production build at all — nothing to reach, nothing to ship.
//
// The one exception is the SANDBOX BUILD the e2e gate runs against (§5.bz: a production-mode
// server is several times lighter per page than `next dev`). It is opted into at build time
// with SANDBOX_BUILD=1, must also point the app at the fake (NEXT_PUBLIC_SANDBOX=1),
// and is written to its own `.next-sandbox` directory, so it can never be the `.next` that
// deploys. A normal `next build` sets neither variable and is exactly what it was.
const sandboxBuild = process.env.SANDBOX_BUILD === '1';
if (sandboxBuild && process.env.NEXT_PUBLIC_SANDBOX !== '1') {
  throw new Error('SANDBOX_BUILD=1 requires NEXT_PUBLIC_SANDBOX=1: a sandbox build must run on the fake backend.');
}
const pageExtensions = ['tsx', 'ts', 'jsx', 'js'];
if (process.env.NODE_ENV !== 'production' || sandboxBuild) pageExtensions.unshift('sandbox.tsx');

const nextConfig: NextConfig = {
  pageExtensions,
  ...(sandboxBuild ? { distDir: '.next-sandbox' } : {}),
  // ALWAYS defined, so every build inlines it as a constant: an unset variable would stay a
  // runtime lookup, `useSandbox` in src/lib/supabase.ts would stop folding to false, and the fake
  // would ship in the real build (no-sandbox-in-build.test.ts caught exactly that).
  env: { SANDBOX_BUILD: sandboxBuild ? '1' : '0' },
  async headers() {
    return [
      {
        // The service worker must never be cached — a bad version would be
        // sticky and users couldn't be updated out of it. Per
        // node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
