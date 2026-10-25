import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { evidence, submissions } from "@/server/db/schema";
import { requireAccount } from "@/server/services/auth";
import { enqueueEvidenceProcessing } from "@/server/worker/queue";
import { json, error, handleError } from "@/server/http";

// Called by the client after it has PUT the file to the signed URL. Verifies
// ownership, then queues the scan + metadata-strip job.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount();
    const { id } = await params;

    const [row] = await db
      .select({ ownerId: submissions.ownerId })
      .from(evidence)
      .innerJoin(submissions, eq(evidence.submissionId, submissions.id))
      .where(eq(evidence.id, id))
      .limit(1);

    if (!row || row.ownerId !== account.id) return error("Not found", 404);

    await enqueueEvidenceProcessing(id);
    return json({ ok: true, status: "processing" });
  } catch (e) {
    return handleError(e);
  }
}
