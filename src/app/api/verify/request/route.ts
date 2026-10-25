import { verifyRequestSchema } from "@/lib/validation";
import { requestVerification } from "@/server/services/verification";
import { getRateLimits } from "@/server/services/config";
import { getClientIp, ipRateLimit } from "@/server/rate-limit";
import { json, error, handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const limits = await getRateLimits();
    if (!ipRateLimit(`otp:${getClientIp(req)}`, limits.ipPerMinute)) {
      return error("Too many requests, please slow down", 429);
    }
    const body = await req.json();
    const input = verifyRequestSchema.parse(body);
    await requestVerification(input.contact, input.contactType);
    // Always a neutral response — never reveal whether a contact exists.
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
