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

// The reason injectManifest (not generateSW) was picked for this whole
// PWA setup in the first place -- generateSW only lets you configure
// caching rules, it has no hook for arbitrary event listeners like these
// two. Payload shape is whatever lib/pushReminder.ts's sendCheckinReminders
// sent, via web-push, as JSON: { title, body, url? }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title: string; body: string; url?: string };
  try {
    payload = event.data.json();
  } catch {
    return; // malformed payload -- fail silently rather than crash the SW
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/" },
    })
  );
});

// Clicking the OS notification focuses an already-open tab on that URL
// if one exists (rather than piling up duplicate tabs), or opens a new
// one otherwise.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((client) => new URL(client.url).pathname === url);
      if (existing) {
        await (existing as WindowClient).focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
