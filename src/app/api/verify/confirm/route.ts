import { eq } from "drizzle-orm";
import { verifyConfirmSchema } from "@/lib/validation";
import { confirmVerification } from "@/server/services/verification";
import { createSession } from "@/server/services/auth";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema";
import { json, error, handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = verifyConfirmSchema.parse(body);
    const result = await confirmVerification(
      input.contact,
      input.contactType,
      input.code,
    );
    if (!result.ok) {
      return error(`Verification failed: ${result.reason}`, 400);
    }

    // Staff accounts with MFA enabled need a second factor before the session
    // is usable — create it as pending and ask for the TOTP code.
    const [acct] = await db
      .select({ role: accounts.role, mfa: accounts.mfaSecretEncrypted })
      .from(accounts)
      .where(eq(accounts.id, result.accountId))
      .limit(1);
    const needsMfa =
      (acct?.role === "moderator" || acct?.role === "admin") && !!acct?.mfa;

    await createSession(result.accountId, { mfaPending: needsMfa });
    return json({ ok: true, mfaRequired: needsMfa });
  } catch (e) {
    return handleError(e);
  }
}
