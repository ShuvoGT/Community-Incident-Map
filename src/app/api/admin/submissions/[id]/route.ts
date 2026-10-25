import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { evidence, reviewsAndFlags } from "@/server/db/schema";
import { requireStaff } from "@/server/services/auth";
import { getSubmissionForReview } from "@/server/services/moderation";
import { signedEvidenceDownload } from "@/server/services/evidence";
import { json, error, handleError } from "@/server/http";

// Full private detail for moderation. Access to private evidence is logged.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff();
    const { id } = await params;
    const sub = await getSubmissionForReview(id);
    if (!sub) return error("Not found", 404);

    const files = await db
      .select()
      .from(evidence)
      .where(eq(evidence.submissionId, id));

    const evidenceLinks = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        fileType: f.fileType,
        scanStatus: f.scanStatus,
        // Short-lived signed link; only clean files are served.
        downloadUrl:
          f.scanStatus === "clean"
            ? await signedEvidenceDownload(f.objectKey)
            : null,
      })),
    );

    // Log that a moderator viewed private evidence for this submission.
    if (files.length > 0) {
      await db.insert(reviewsAndFlags).values({
        targetType: "submission",
        targetId: id,
        actorId: actor.id,
        action: "evidence_viewed",
        evidenceReviewBasis: `${files.length} file(s)`,
      });
    }

    return json({
      submission: {
        id: sub.id,
        category: sub.category,
        relationship: sub.relationship,
        experience: sub.originalText,
        structuredAnswers: sub.structuredAnswers,
        occurrenceDate: sub.occurrenceLocalDate,
        occurrenceTime: sub.occurrenceTime,
        timePrecision: sub.timePrecision,
        cellId: sub.cellId,
        broadArea: sub.broadArea,
        weaponReported: sub.weaponReported,
        weaponType: sub.weaponType,
        injury: sub.injury,
        offenderBand: sub.offenderBand,
        status: sub.status,
        version: sub.version,
      },
      evidence: evidenceLinks,
    });
  } catch (e) {
    return handleError(e);
  }
}
