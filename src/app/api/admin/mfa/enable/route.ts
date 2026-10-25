import { z } from "zod";
import { requireStaff } from "@/server/services/auth";
import { enableMfa } from "@/server/services/mfa";
import { json, error, handleError } from "@/server/http";

const schema = z.object({
  secret: z.string().trim().min(16).max(128),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  try {
    const account = await requireStaff();
    const { secret, code } = schema.parse(await req.json());
    const ok = await enableMfa(account.id, secret, code);
    return ok ? json({ ok: true }) : error("Code did not verify", 400);
  } catch (e) {
    return handleError(e);
  }
}
