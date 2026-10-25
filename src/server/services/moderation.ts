import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { submissions, incidents, reviewsAndFlags } from "../db/schema";
import { newPublicId } from "@/lib/ids";
import { timeBandFromLocalTime } from "@/lib/time";
import { recomputeCellWindow } from "./aggregates";

export class VersionConflictError extends Error {}

// Submissions awaiting a moderation decision, newest first. Priority ordering
// (identifying info/threats → weapon/injury → ordinary) is layered on in the
// UI; here we expose the raw private queue.
export function listReviewQueue() {
  return db
    .select()
    .from(submissions)
    .where(
      inArray(submissions.status, ["submitted", "under_review"]),
    )
    .orderBy(desc(submissions.createdAt));
}

export async function getSubmissionForReview(id: string) {
  const [row] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, id))
    .limit(1);
  return row ?? null;
}

type PublishInput = {
  redactedNarrative: string;
  reviewLabel?: "community_reviewed" | "supporting_reviewed" | "independently_corroborated" | "disputed";
  expectedVersion?: number;
};

// Publishing writes a redacted, safe record into the public read model. The
// redacted narrative is authored by the moderator, separate from the private
// original. Never copies contact, evidence, financial loss or coordinates.
export async function publishSubmission(
  actorId: string,
  submissionId: string,
  input: PublishInput,
): Promise<{ incidentId: string; publicId: string }> {
  const sub = await getSubmissionForReview(submissionId);
  if (!sub) throw new Error("Submission not found");
  if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
    throw new VersionConflictError();
  }

  const answers = (sub.structuredAnswers ?? {}) as {
    itemsTaken?: string[];
  };

  const publicId = newPublicId();
  const [incident] = await db
    .insert(incidents)
    .values({
      publicId,
      category: sub.category,
      occurrenceDate: sub.occurrenceLocalDate,
      timeBand: timeBandFromLocalTime(sub.occurrenceTime),
      cellId: sub.cellId,
      broadArea: sub.broadArea,
      redactedNarrative: input.redactedNarrative,
      itemsTakenPublic: (answers.itemsTaken ?? []).filter(
        (i) => i !== "unknown" && i !== "nothing",
      ),
      offenderBand: sub.offenderBand,
      weaponFlag: sub.weaponReported === true,
      injuryFlag: sub.injury === "yes",
      reviewLabel: input.reviewLabel ?? "community_reviewed",
      publicationState: "published",
      publishedAt: new Date(),
    })
    .returning({ id: incidents.id, publicId: incidents.publicId });

  await db
    .update(submissions)
    .set({
      canonicalIncidentId: incident.id,
      status: "published",
      version: sub.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));

  await db.insert(reviewsAndFlags).values({
    targetType: "incident",
    targetId: incident.id,
    actorId,
    action: "published",
    beforeVersion: sub.version,
    afterVersion: sub.version + 1,
  });

  // Reflect the new published incident in the public hotspot aggregates.
  if (sub.cellId) {
    await recomputeCellWindow(sub.cellId);
  }

  return { incidentId: incident.id, publicId: incident.publicId };
}

// Merge duplicate submissions of the same event into one canonical incident.
// Each child is marked 'merged' and linked to the incident; it produces no
// incident of its own, so the event counts once. If a child was already
// published, its own incident is withdrawn and that cell recomputed.
export async function mergeIntoIncident(
  actorId: string,
  incidentId: string,
  submissionIds: string[],
): Promise<number> {
  const [incident] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!incident) throw new Error("Canonical incident not found");

  let merged = 0;
  for (const id of submissionIds) {
    const [sub] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, id))
      .limit(1);
    if (!sub || sub.canonicalIncidentId === incidentId) continue;

    // If this duplicate was published on its own, retire that incident.
    if (sub.status === "published" && sub.canonicalIncidentId) {
      await db
        .update(incidents)
        .set({ publicationState: "withdrawn", updatedAt: new Date() })
        .where(eq(incidents.id, sub.canonicalIncidentId));
      if (sub.cellId) await recomputeCellWindow(sub.cellId);
    }

    await db
      .update(submissions)
      .set({
        status: "merged",
        canonicalIncidentId: incidentId,
        version: sub.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, id));

    await db.insert(reviewsAndFlags).values({
      targetType: "submission",
      targetId: id,
      actorId,
      action: "merged",
      reason: `into incident ${incidentId}`,
      beforeVersion: sub.version,
      afterVersion: sub.version + 1,
    });
    merged++;
  }
  return merged;
}

// Reverse a merge: the submission becomes an independent review item again.
export async function unmergeSubmission(
  actorId: string,
  submissionId: string,
): Promise<void> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);
  if (!sub) throw new Error("Submission not found");

  await db
    .update(submissions)
    .set({
      status: "under_review",
      canonicalIncidentId: null,
      version: sub.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));

  await db.insert(reviewsAndFlags).values({
    targetType: "submission",
    targetId: submissionId,
    actorId,
    action: "unmerged",
    beforeVersion: sub.version,
    afterVersion: sub.version + 1,
  });
}

export async function decideSubmission(
  actorId: string,
  submissionId: string,
  decision: "rejected" | "needs_clarification",
  reason: string,
): Promise<void> {
  const sub = await getSubmissionForReview(submissionId);
  if (!sub) throw new Error("Submission not found");

  await db
    .update(submissions)
    .set({ status: decision, updatedAt: new Date() })
    .where(eq(submissions.id, submissionId));

  await db.insert(reviewsAndFlags).values({
    targetType: "submission",
    targetId: submissionId,
    actorId,
    action: decision,
    reason,
  });
}
