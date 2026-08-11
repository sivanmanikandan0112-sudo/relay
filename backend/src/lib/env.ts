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
};
