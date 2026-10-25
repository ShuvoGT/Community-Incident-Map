import { z } from "zod";
import { getPendingMfaAccount, completeMfa } from "@/server/services/auth";
import { verifyChallenge } from "@/server/services/mfa";
import { json, error, handleError } from "@/server/http";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

// Second-factor challenge for a staff session created as MFA-pending.
export async function POST(req: Request) {
  try {
    const { code } = schema.parse(await req.json());
    const pending = await getPendingMfaAccount();
    if (!pending) return error("No pending MFA session", 400);

    if (!verifyChallenge(pending.mfaSecretEncrypted, code)) {
      return error("Invalid code", 400);
    }
    await completeMfa(pending.sessionId);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
