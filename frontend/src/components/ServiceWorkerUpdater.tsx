import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// How often to actively ask the browser to re-check whether a newer
// service worker exists, instead of relying only on the browser's own
// lazy default (a byte-diff check on real navigations, and at most once
// every ~24h otherwise). Short enough that nobody sits behind a fresh
// deploy for long; long enough not to be a meaningful network cost.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Mounted once at the App root (not inside Layout) so it works
// regardless of which page is showing -- Home, Login, or an
// authenticated route. Renders nothing.
//
// A new version now activates itself the moment it's found, instead of
// waiting for someone to notice and click a "Refresh" toast (which is
// what this component used to render). updateServiceWorker(false) below
// -- the `false` is the whole point -- activates the waiting worker
// without forcing this tab to reload, so nobody mid check-in gets
// yanked out from under themselves; it only changes what the *next*
// real page load (a fresh navigation, not this SPA's client-side
// routing) gets served, exactly the safety property the old toast was
// protecting. What the toast actually did wrong was make that update
// conditional on a person noticing a prompt and clicking it -- after
// the Sep 10 outage, at least one person's tab was left stuck on stale,
// possibly broken content with no indication anything could be done
// about it. The periodic/visibility-triggered check below closes the
// other half of that gap: the browser's own default recheck schedule is
// lazy enough that someone who just leaves a tab open could go the better
// part of a day before it would have noticed a new version even existed.
export function ServiceWorkerUpdater() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      setRegistration(reg ?? null);
    },
    onRegisterError(error: unknown) {
      console.error("Service worker registration failed:", error);
    },
  });

  useEffect(() => {
    if (!registration) return;
    const check = () => registration.update().catch(() => {});
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    // Covers a tab that's been backgrounded (phone locked, other tab
    // focused) and comes back -- exactly the shape of session most
    // likely to have missed the last however-many deploys.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [registration]);

  useEffect(() => {
    if (needRefresh) updateServiceWorker(false);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
