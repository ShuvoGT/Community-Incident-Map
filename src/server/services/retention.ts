import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  submissions,
  incidents,
  evidence,
  reviewsAndFlags,
} from "../db/schema";
import { getRetention } from "./config";
import { deleteEvidenceObject } from "./evidence";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const monthsAgo = (n: number) => daysAgo(n * 30);

// Delete private evidence rows (and their stored objects) for the given
// submissions, best-effort on storage.
async function purgeEvidenceFor(submissionIds: string[]): Promise<number> {
  if (submissionIds.length === 0) return 0;
  const files = await db
    .select()
    .from(evidence)
    .where(inArray(evidence.submissionId, submissionIds));
  for (const f of files) await deleteEvidenceObject(f.objectKey);
  if (files.length > 0) {
    await db
      .delete(evidence)
      .where(inArray(evidence.submissionId, submissionIds));
  }
  return files.length;
}

/**
 * Apply the configured retention policy. Idempotent and safe to run daily.
 * Returns a summary of what was purged.
 */
export async function runRetention() {
  const policy = await getRetention();
  const summary = {
    rejectedAbandoned: 0,
    evidencePurged: 0,
    narrativesCleared: 0,
    incidentsExpired: 0,
    auditLogsPurged: 0,
  };

  // 1) Rejected / abandoned submissions past their window: drop evidence then
  //    the submission. ('draft' = abandoned, 'rejected' = declined.)
  const raCutoff = daysAgo(policy.rejectedAbandonedDays);
  const ra = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        inArray(submissions.status, ["draft", "rejected"]),
        lt(submissions.updatedAt, raCutoff),
      ),
    );
  const raIds = ra.map((r) => r.id);
  summary.evidencePurged += await purgeEvidenceFor(raIds);
  if (raIds.length > 0) {
    await db.delete(submissions).where(inArray(submissions.id, raIds));
    summary.rejectedAbandoned = raIds.length;
  }

  // 2) Evidence + original unredacted narrative, 90 days after final review.
  //    Terminal states: published, withdrawn, merged (rejected handled above).
  const enCutoff = daysAgo(policy.evidenceNarrativeDays);
  const en = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        inArray(submissions.status, ["published", "withdrawn", "merged"]),
        lt(submissions.updatedAt, enCutoff),
        sql`${submissions.originalText} <> ''`,
      ),
    );
  const enIds = en.map((r) => r.id);
  summary.evidencePurged += await purgeEvidenceFor(enIds);
  if (enIds.length > 0) {
    await db
      .update(submissions)
      .set({ originalText: "" })
      .where(inArray(submissions.id, enIds));
    summary.narrativesCleared = enIds.length;
  }

  // 3) Public redacted incidents past 12 months: remove the narrative and hide
  //    them; non-identifying aggregates are retained separately.
  const incCutoff = monthsAgo(policy.publicIncidentMonths);
  const expired = await db
    .update(incidents)
    .set({ redactedNarrative: "", publicationState: "withdrawn", updatedAt: new Date() })
    .where(
      and(
        eq(incidents.publicationState, "published"),
        lt(incidents.publishedAt, incCutoff),
      ),
    )
    .returning({ id: incidents.id });
  summary.incidentsExpired = expired.length;

  // 4) Audit logs past 180 days.
  const logCutoff = daysAgo(policy.auditLogDays);
  const logs = await db
    .delete(reviewsAndFlags)
    .where(lt(reviewsAndFlags.createdAt, logCutoff))
    .returning({ id: reviewsAndFlags.id });
  summary.auditLogsPurged = logs.length;

  return summary;
}
