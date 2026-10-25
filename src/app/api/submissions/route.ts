import { randomUUID } from "node:crypto";
import { submissionCreateSchema } from "@/lib/validation";
import { requireAccount } from "@/server/services/auth";
import {
  createSubmission,
  LocationOutOfAreaError,
  DailySubmissionLimitError,
} from "@/server/services/submissions";
import { getRateLimits } from "@/server/services/config";
import { getClientIp, ipRateLimit } from "@/server/rate-limit";
import { json, error, handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const account = await requireAccount();
    const limits = await getRateLimits();
    if (!ipRateLimit(`submit:${getClientIp(req)}`, limits.ipPerMinute)) {
      return error("Too many requests, please slow down", 429);
    }
    const body = await req.json();
    const input = submissionCreateSchema.parse(body);

    // Idempotency key prevents a retry creating a second submission.
    const idempotencyKey =
      req.headers.get("idempotency-key") ?? randomUUID();

    const result = await createSubmission(account.id, input, idempotencyKey);
    // Return a private submission id + pending state. Never auto-publish.
    return json({ id: result.id, status: result.status }, 201);
  } catch (e) {
    if (e instanceof LocationOutOfAreaError) {
      return error("Location is outside the launch area", 422);
    }
    if (e instanceof DailySubmissionLimitError) {
      return error("Daily submission limit reached for this contact", 429);
    }
    return handleError(e);
  }
}
