import { useRegisterSW } from "virtual:pwa-register/react";

// Mounted once at the App root (not inside Layout) so it works
// regardless of which page is showing -- Home, Login, or an
// authenticated route. registerType: "prompt" in vite.config.ts means
// the new service worker sits "waiting" until this toast's button is
// clicked; nothing swaps out from under someone mid check-in.
export function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error("Service worker registration failed:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 200 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "var(--panel-2)",
          border: "1px solid var(--border-2)",
          borderRadius: 10,
          padding: "12px 16px",
          boxShadow: "0 12px 30px rgba(0, 0, 0, .45)",
        }}
      >
        <span style={{ fontSize: 13.5, color: "var(--text-light)" }}>A new version of Relay is available.</span>
        <button className="btn-primary" style={{ padding: "7px 14px" }} onClick={() => updateServiceWorker(true)}>
          Refresh
        </button>
      </div>
    </div>
  );
}
