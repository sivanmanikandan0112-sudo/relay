import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest, not the default generateSW, because the service
      // worker also needs custom push/notificationclick handlers (see
      // src/sw.ts) -- generateSW only lets you bolt on simple runtime
      // caching rules, not arbitrary event listeners.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // "prompt", not "autoUpdate" -- a new deploy shouldn't silently
      // swap the app out from under someone mid-session; Layout.tsx's
      // update toast (via virtual:pwa-register/react) asks first.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Relay",
        short_name: "Relay",
        description: "Overreaching radar for high school track and cross country teams.",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0e16",
        theme_color: "#0a0e16",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        // The e2e/integration test databases and this repo's own test
        // fixtures never touch the built frontend, but Vite's dev server
        // output isn't precache-manifest-worthy either -- only precache
        // what `vite build` actually emits.
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
      devOptions: {
        // The service worker only runs against a real production build
        // (`npm run build && npm run preview`) -- enabling it under
        // `vite dev` would mean every source file edit fights the
        // precache instead of Vite's own instant HMR.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  // `vite preview` (the relay-frontend-preview launch config -- the only
  // way to test the real service worker locally, see vite.config.ts's
  // own devOptions.enabled comment above) doesn't inherit server.proxy;
  // it needs this separate copy of the same rule to reach the local
  // backend too.
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
