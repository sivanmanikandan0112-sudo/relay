interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleButtonConfig {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  width?: number;
  text?: "signin_with" | "signup_with" | "continue_with";
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void;
          renderButton: (parent: HTMLElement, config: GoogleButtonConfig) => void;
        };
      };
    };
  }
}

// No wrapper library -- same "use the platform API directly" spirit as
// the rest of this app (no charting library either, see BarChart.tsx).
// Loaded once, reused for both Login.tsx's sign-in button and Profile.tsx's
// link-account button; the only difference between the two is what the
// caller does with the resulting ID token.
let scriptLoaded: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (!scriptLoaded) {
    scriptLoaded = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load Google's sign-in script"));
      document.head.appendChild(script);
    });
  }
  return scriptLoaded;
}

/**
 * Renders Google's own "Sign in with Google" button into the element
 * with the given id, and calls `onCredential` with the ID token once the
 * user completes it. Does nothing (no button, no error) if
 * VITE_GOOGLE_CLIENT_ID isn't set -- degrades cleanly rather than
 * showing a broken button before Google sign-in is configured.
 */
export async function renderGoogleButton(containerId: string, text: GoogleButtonConfig["text"], onCredential: (idToken: string) => void): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) return;

  await loadGoogleScript();
  const container = document.getElementById(containerId);
  if (!container || !window.google) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  });
  window.google.accounts.id.renderButton(container, { theme: "outline", size: "large", width: 280, text });
}
