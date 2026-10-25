import { z } from "zod";
import { requireStaff } from "@/server/services/auth";
import {
  mergeIntoIncident,
  unmergeSubmission,
} from "@/server/services/moderation";
import { json, handleError } from "@/server/http";

const mergeSchema = z.object({
  incidentId: z.string().uuid(),
  submissionIds: z.array(z.string().uuid()).min(1),
});
const unmergeSchema = z.object({ submissionId: z.string().uuid() });

// POST with {incidentId, submissionIds} merges; with {submissionId} unmerges.
export async function POST(req: Request) {
  try {
    const actor = await requireStaff();
    const body = await req.json();
    if ("submissionId" in (body ?? {})) {
      const { submissionId } = unmergeSchema.parse(body);
      await unmergeSubmission(actor.id, submissionId);
      return json({ ok: true, action: "unmerged" });
    }
    const { incidentId, submissionIds } = mergeSchema.parse(body);
    const merged = await mergeIntoIncident(actor.id, incidentId, submissionIds);
    return json({ ok: true, action: "merged", merged });
  } catch (e) {
    return handleError(e);
  }
}
