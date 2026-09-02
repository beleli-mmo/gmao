import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // le shell applicatif est précaché ; les données passent par PouchDB, pas par le SW
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly', // jamais de cache API : l'offline est géré par PouchDB
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
  resolve: { alias: { '@gmao/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname } },
});
