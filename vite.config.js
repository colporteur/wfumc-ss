import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Set BASE_PATH in your build env to match the GitHub Pages repo path,
// e.g. "/wfumc-ss/". Defaults to "/" for local dev.
const base = process.env.VITE_BASE_PATH || '/';

const buildTime = new Date().toISOString();
const buildSha = (process.env.GITHUB_SHA || 'local').slice(0, 7);

export default defineConfig({
  base,
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*'],
      manifest: {
        // Public-facing class members are encouraged to add to home
        // screen — short_name + name reflect public branding.
        name: "Todd & Tyler's Excellent Adventure Sunday School",
        short_name: 'Sunday School',
        description:
          "Sunday School app for Todd & Tyler's Excellent Adventure Class — active lesson, past topics, roster, and submit-a-question form.",
        theme_color: '#5b1a1a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Distinct port from the other WFUMC apps (Lesson Maker is 5179,
    // Daily Capture is 5178).
    port: 5180,
  },
});
