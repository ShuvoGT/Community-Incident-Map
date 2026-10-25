import { verifyConfirmSchema } from "@/lib/validation";
import { confirmVerification } from "@/server/services/verification";
import { createSession } from "@/server/services/auth";
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
    await createSession(result.accountId);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
