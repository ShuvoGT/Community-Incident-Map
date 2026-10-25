import { submissionCorrectionSchema } from "@/lib/validation";
import { requireAccount } from "@/server/services/auth";
import {
  getOwnerSubmission,
  correctSubmission,
  withdrawSubmission,
} from "@/server/services/submissions";
import { json, error, handleError } from "@/server/http";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount();
    const { id } = await params;
    const row = await getOwnerSubmission(account.id, id);
    if (!row) return error("Not found", 404);
    return json({
      id: row.id,
      category: row.category,
      relationship: row.relationship,
      status: row.status,
      occurrenceDate: row.occurrenceLocalDate,
      broadArea: row.broadArea,
      experience: row.originalText,
      version: row.version,
    });
  } catch (e) {
    return handleError(e);
  }
}

// PATCH: correction (reviewable revision) or withdrawal.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount();
    const { id } = await params;
    const body = await req.json();

    if (body?.action === "withdraw") {
      const ok = await withdrawSubmission(account.id, id);
      return ok ? json({ ok: true, status: "withdrawn" }) : error("Not found", 404);
    }

    const patch = submissionCorrectionSchema.parse(body);
    const ok = await correctSubmission(account.id, id, patch);
    return ok
      ? json({ ok: true, status: "under_review" })
      : error("Not found", 404);
  } catch (e) {
    return handleError(e);
  }
}
