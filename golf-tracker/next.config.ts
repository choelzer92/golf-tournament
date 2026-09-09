import type { NextConfig } from "next";

// The sandbox seed page (src/app/sandbox/page.sandbox.tsx) is a DEV-ONLY UI
// harness. Guarding its render with a flag was not enough: Next still compiled the
// route and shipped its seed logic (fixture players, savePoolGame calls) into
// production JS chunks as unreachable-but-present code. Recognising the
// `.sandbox.tsx` page extension only outside production means the route does not
// exist in a production build at all — nothing to reach, nothing to ship.
const pageExtensions = ['tsx', 'ts', 'jsx', 'js'];
if (process.env.NODE_ENV !== 'production') pageExtensions.unshift('sandbox.tsx');

const nextConfig: NextConfig = {
  pageExtensions,
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
