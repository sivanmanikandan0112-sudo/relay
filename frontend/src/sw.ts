/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// vite-plugin-pwa injects the actual list of built files (with content
// hashes) here at build time -- this is the whole app shell (JS/CSS/HTML/
// icons), so a repeat visit loads instantly from cache and the app still
// opens (to its last-cached state) with no network at all.
precacheAndRoute(self.__WB_MANIFEST);

// API calls are deliberately NOT precached and always prefer the network
// -- a coach's Brief or an athlete's readiness score must never be
// silently stale. NetworkFirst still falls back to the last real
// response if the network genuinely fails, which beats a blank screen,
// but network wins whenever it's available at all.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({ cacheName: "api-cache", networkTimeoutSeconds: 10 })
);

// Lets Layout.tsx's update-available toast actually apply the new
// version: the waiting worker only calls skipWaiting() when the user
// clicks "Refresh", never automatically (registerType: "prompt" in
// vite.config.ts) -- a deploy shouldn't swap the app out from under
// someone mid check-in.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
