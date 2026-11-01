/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ringer',
        short_name: 'Ringer',
        description: 'Scorekeeping for the Reno Horseshoe League',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // Manifest values can't read CSS variables: these mirror --team-a and
        // --color-bg in src/styles/tokens.css.
        theme_color: '#053961',
        background_color: '#f2f2f3',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2 included so the self-hosted fonts work offline. (.woff files
        // are only a fallback for very old browsers; not precached.)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
