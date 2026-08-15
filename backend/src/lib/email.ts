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
    // Surfaced to the caller as a normal thrown error -- the right
    // behavior for a route where sending *is* the deliverable (e.g.
    // forgot-password: if the email can't go out, the request itself
    // failed, there's no side effect worth preserving). Routes where a
    // real mutation already succeeded and the email is just a courtesy
    // notification should use trySendEmail below instead, not this
    // directly -- see its own comment for why.
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

/**
 * Same as sendEmail, but never throws -- for the common case where a
 * real mutation (an invite created, an account approved, MFA reset)
 * already succeeded before the notification, and a Resend hiccup
 * shouldn't turn that success into a 500 for the caller. Logs the
 * failure server-side and returns whether it actually sent, so the
 * route can still report an accurate emailSent flag if it wants one.
 *
 * This is also the specific fix for a real production incident: an
 * unguarded `await sendEmail(...)` after a successful account-approval
 * transaction in routes/schools.ts threw on a bad recipient address and
 * crashed the entire process (Express 4 doesn't auto-catch async
 * rejections -- see app.ts's express-async-errors comment for the other
 * half of this fix). Every "notify after the real work is already done"
 * call site should go through this, not raw sendEmail.
 */
export async function trySendEmail(input: SendEmailInput): Promise<boolean> {
  try {
    await sendEmail(input);
    return true;
  } catch (err) {
    console.error("[email] send failed, continuing anyway:", err);
    return false;
  }
}
