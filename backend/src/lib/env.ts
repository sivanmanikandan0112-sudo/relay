import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Email: intentionally optional. Unset (the default in dev/test) -- see
  // lib/email.ts -- means "simulate": log to the console and let the
  // caller fall back to returning the token/link directly in the API
  // response, same as this app has always done. Set RESEND_API_KEY (only
  // meant to be set in production) to send real email through Resend
  // instead. Never required() -- dev/test must work with zero email setup.
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM ?? "Relay <onboarding@resend.dev>",
  // Used to build links embedded in real emails (reset-password, accept-invite);
  // the frontend origin serving those pages, e.g. "https://relaycoach.app".
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",

  // Required for MFA (see lib/crypto.ts) -- not required() here, same
  // optional-at-boot pattern as resendApiKey, but unlike email there's no
  // simulate fallback: lib/crypto.ts throws a clear error at the point of
  // use if this is missing or the wrong length, rather than ever falling
  // back to storing a TOTP secret insecurely.
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,

  // Required for "Sign in with Google" (lib/google.ts) -- the OAuth
  // client ID registered in Google Cloud Console for this domain. Not
  // required() here, same optional-at-boot pattern as resendApiKey:
  // lib/google.ts throws a clear error at the point of use if it's
  // missing, rather than the whole app failing to boot over a feature
  // that hasn't been configured yet. Not a secret -- the frontend embeds
  // the same client ID (VITE_GOOGLE_CLIENT_ID) to render the button.
  googleClientId: process.env.GOOGLE_CLIENT_ID,

  // Required for Web Push (lib/push.ts) -- a VAPID keypair identifying
  // this server to push services (FCM, Mozilla autopush, etc.), one-time
  // generated with `npx web-push generate-vapid-keys`. Same
  // optional-at-boot pattern as the rest of this block: lib/push.ts
  // simply no-ops (trySendPush returns "unconfigured") rather than the
  // app failing to boot, since push is an enhancement, not something
  // anything else depends on. vapidPublicKey is not a secret -- the
  // frontend embeds the same value (VITE_VAPID_PUBLIC_KEY) to subscribe,
  // exactly like googleClientId/VITE_GOOGLE_CLIENT_ID above. vapidSubject
  // is a mailto: or https: URL push services may contact if this server
  // is misbehaving (sending too much, etc.) -- required by the spec
  // whenever the keys themselves are set.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@relaycoach.app",
};
