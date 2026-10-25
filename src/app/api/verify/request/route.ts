import { verifyRequestSchema } from "@/lib/validation";
import { requestVerification } from "@/server/services/verification";
import { json, handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = verifyRequestSchema.parse(body);
    await requestVerification(input.contact, input.contactType);
    // Always a neutral response — never reveal whether a contact exists.
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
