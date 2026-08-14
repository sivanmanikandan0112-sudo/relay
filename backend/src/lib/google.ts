import { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!env.googleClientId) {
    throw new Error("Missing GOOGLE_CLIENT_ID -- register an OAuth client in Google Cloud Console for this domain");
  }
  if (!client) client = new OAuth2Client(env.googleClientId);
  return client;
}

export interface GoogleIdentity {
  googleId: string; // Google's own stable "sub" claim -- never reused, never changes for a given Google account
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Verifies a Google ID token's signature against Google's own public keys
 * and that it was actually issued for *this* app (the `aud` claim must
 * match GOOGLE_CLIENT_ID) -- never trust a client-supplied ID token
 * without this. Throws on anything invalid or expired; callers turn that
 * into a 401, same as an invalid password.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const ticket = await getClient().verifyIdToken({ idToken, audience: env.googleClientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Google ID token had no payload");

  return {
    googleId: payload.sub,
    email: payload.email?.toLowerCase() ?? "",
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? null,
  };
}
