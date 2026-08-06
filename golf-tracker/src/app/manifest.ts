import type { MetadataRoute } from 'next';

// Web app manifest (Next 16 native file convention) so the app is installable
// to a phone home screen — the intended way to run a solo round on the course
// (full-screen, one-hand, in your hand). Offline resilience for a round comes
// from the local-first round state (localStorage), not a service worker, so no
// SW is registered here. See node_modules/next/dist/docs/.../progressive-web-apps.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Golf Tracker',
    short_name: 'Golf',
    description: 'Track your golf games and log solo rounds with GHIN handicaps.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#166534',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
