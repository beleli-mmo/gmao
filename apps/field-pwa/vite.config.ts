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
      includeAssets: ['icons/favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'GMAO Terrain',
        short_name: 'GMAO',
        description: 'Demandes d’intervention terrain — maintenance & exploitation',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a4a16',
        theme_color: '#0b5d1e',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
