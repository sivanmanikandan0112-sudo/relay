import { Resend } from "resend";
import { env } from "./env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

/** Whether real email sending is configured -- routes use this to decide whether to also return a token/link directly in the API response (dev/test convenience) or keep it server-side only (production). */
export const emailEnabled = resend !== null;

if (env.nodeEnv === "production" && !emailEnabled) {
  // Not fatal -- the app should still boot and simulate rather than crash
  // -- but this should never be silently true in a real deployment, so
  // it's loud on startup rather than only discoverable when a password
  // reset mysteriously never arrives.
  console.warn(
    "[email] NODE_ENV=production but RESEND_API_KEY is not set -- emails will only be logged to the " +
      "console, not actually sent. Set RESEND_API_KEY (and EMAIL_FROM, FRONTEND_URL) to fix this."
  );
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a real email via Resend when RESEND_API_KEY is configured
 * (production); otherwise simulates by logging to the console and
 * returning without error -- callers that need a fallback for this case
 * (e.g. showing the link directly in the API response instead) should
 * check `emailEnabled` themselves, the way auth.ts and invites.ts do.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!resend) {
    console.log(`[email:simulated] to=${to} subject="${subject}" (RESEND_API_KEY not set, nothing sent)`);
    return;
  }
  const { error } = await resend.emails.send({ from: env.emailFrom, to, subject, html });
  if (error) {
    // Surfaced to the caller as a normal thrown error, same as any other
    // failed dependency call -- routes don't currently catch this
    // specially, so it'll produce a 500, which is the right behavior for
    // "we told the user we'd email them and then didn't."
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
