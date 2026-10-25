import { z } from "zod";
import { requireStaff } from "@/server/services/auth";
import {
  publishSubmission,
  decideSubmission,
  VersionConflictError,
} from "@/server/services/moderation";
import { json, error, handleError } from "@/server/http";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
    redactedNarrative: z.string().trim().min(10).max(2000),
    reviewLabel: z
      .enum([
        "community_reviewed",
        "supporting_reviewed",
        "independently_corroborated",
        "disputed",
      ])
      .optional(),
    expectedVersion: z.number().int().optional(),
  }),
  z.object({
    action: z.enum(["reject", "needs_clarification"]),
    reason: z.string().trim().min(3).max(500),
  }),
]);

// Role-checked moderation transition with reason and version guard.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff();
    const { id } = await params;
    const input = schema.parse(await req.json());

    if (input.action === "publish") {
      const result = await publishSubmission(actor.id, id, {
        redactedNarrative: input.redactedNarrative,
        reviewLabel: input.reviewLabel,
        expectedVersion: input.expectedVersion,
      });
      return json({ ok: true, ...result });
    }

    const decision = input.action === "reject" ? "rejected" : "needs_clarification";
    await decideSubmission(actor.id, id, decision, input.reason);
    return json({ ok: true, status: decision });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return error("This submission changed since you loaded it", 409);
    }
    return handleError(e);
  }
}
