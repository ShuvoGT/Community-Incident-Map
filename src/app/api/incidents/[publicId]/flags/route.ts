import { z } from "zod";
import { recordConcern } from "@/server/services/flags";
import { getRateLimits } from "@/server/services/config";
import { getClientIp, ipRateLimit } from "@/server/rate-limit";
import { json, error, handleError } from "@/server/http";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const limits = await getRateLimits();
    if (!ipRateLimit(`flag:${getClientIp(req)}`, limits.ipPerMinute)) {
      return error("Too many requests, please slow down", 429);
    }
    const { publicId } = await params;
    const { reason } = schema.parse(await req.json());
    await recordConcern(publicId, reason);
    // Neutral response — never disclose whether a report exists or who flagged.
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
