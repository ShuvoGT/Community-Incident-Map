import { randomUUID } from "node:crypto";
import { submissionCreateSchema } from "@/lib/validation";
import { requireAccount } from "@/server/services/auth";
import {
  createSubmission,
  LocationOutOfAreaError,
} from "@/server/services/submissions";
import { json, error, handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const account = await requireAccount();
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
    return handleError(e);
  }
}
