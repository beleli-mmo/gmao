import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // le shell applicatif est précaché ; les données passent par l'API, pas par le SW
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        // le nouveau SW prend la main immédiatement → pas de version bloquée en cache
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly', // jamais de cache API
          },
        ],
      },
      manifest: {
        name: 'GMAO Terrain',
        short_name: 'GMAO',
        start_url: '/',
        display: 'standalone',
        background_color: '#12171d',
        theme_color: '#0b5d1e',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  // pouchdb-browser attend le module Node `events` : on le remplace par le polyfill npm
  // et on force `global` = `globalThis` (autres accès Node résiduels).
  define: {
    global: 'globalThis',
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  resolve: {
    alias: {
      events: 'events',
    },
  },
  optimizeDeps: { include: ['pouchdb-browser', 'events'] },
});
