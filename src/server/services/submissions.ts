import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { submissions, incidents, reviewsAndFlags } from "../db/schema";
import { deriveCell, isWithinLaunchArea } from "@/lib/h3";
import { timeBandFromLocalTime } from "@/lib/time";
import type {
  SubmissionCreateInput,
  SubmissionCorrectionInput,
} from "@/lib/validation";

export class LocationOutOfAreaError extends Error {}

// Create a submission. The raw coordinate is converted to an H3 cell and then
// discarded — only the cell id is persisted. Idempotent per (owner, key): a
// retry returns the first submission instead of creating a second.
export async function createSubmission(
  ownerId: string,
  input: SubmissionCreateInput,
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  const [existing] = await db
    .select({ id: submissions.id, status: submissions.status })
    .from(submissions)
    .where(
      and(
        eq(submissions.ownerId, ownerId),
        eq(submissions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  let cellId: string | null = null;
  if (input.locationPrecision === "street") {
    if (!isWithinLaunchArea(input.lat!, input.lng!)) {
      throw new LocationOutOfAreaError();
    }
    // Derive and keep only the cell — never persist the raw coordinate.
    cellId = deriveCell(input.lat!, input.lng!);
  }

  const structuredAnswers = {
    itemsTaken: input.itemsTaken ?? [],
    itemValueBdt: input.itemValueBdt ?? null,
    context: input.context ?? null,
    lighting: input.lighting ?? null,
    policeReport: input.policeReport ?? null,
  };

  const [created] = await db
    .insert(submissions)
    .values({
      ownerId,
      category: input.category,
      relationship: input.relationship,
      originalText: input.experience,
      structuredAnswers,
      occurrenceLocalDate: input.occurrenceDate,
      occurrenceTime: input.occurrenceTime ?? null,
      timePrecision: input.timePrecision,
      // rawLat/rawLng intentionally left null: the coordinate is discarded.
      cellId,
      broadArea: input.broadArea ?? null,
      locationPrecision: input.locationPrecision,
      weaponReported: input.weaponReported ?? null,
      weaponType: input.weaponType ?? null,
      injury: input.injury ?? null,
      offenderBand: input.offenderBand ?? null,
      status: "submitted",
      idempotencyKey,
    })
    .returning({ id: submissions.id, status: submissions.status });

  return created;
}

export async function listOwnerSubmissions(ownerId: string) {
  return db
    .select()
    .from(submissions)
    .where(eq(submissions.ownerId, ownerId))
    .orderBy(desc(submissions.createdAt));
}

export async function getOwnerSubmission(ownerId: string, id: string) {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

// A correction creates a reviewable revision: the edit is applied to the
// private submission and the status returns to the review queue. The public
// incident (if any) is NOT changed until a moderator republishes.
export async function correctSubmission(
  ownerId: string,
  id: string,
  patch: SubmissionCorrectionInput,
): Promise<boolean> {
  const current = await getOwnerSubmission(ownerId, id);
  if (!current) return false;

  const structuredAnswers = {
    ...(current.structuredAnswers as Record<string, unknown>),
    ...(patch.itemsTaken ? { itemsTaken: patch.itemsTaken } : {}),
    ...(patch.context !== undefined ? { context: patch.context } : {}),
    ...(patch.lighting !== undefined ? { lighting: patch.lighting } : {}),
  };

  await db
    .update(submissions)
    .set({
      originalText: patch.experience ?? current.originalText,
      offenderBand: patch.offenderBand ?? current.offenderBand,
      structuredAnswers,
      status: "under_review",
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, id));

  await db.insert(reviewsAndFlags).values({
    targetType: "submission",
    targetId: id,
    actorId: ownerId,
    action: "correction_submitted",
    beforeVersion: current.version,
    afterVersion: current.version + 1,
  });

  return true;
}

// Withdrawal removes public visibility immediately and takes the record out of
// aggregate eligibility. Private deletion is queued separately by retention.
export async function withdrawSubmission(
  ownerId: string,
  id: string,
): Promise<boolean> {
  const current = await getOwnerSubmission(ownerId, id);
  if (!current) return false;

  await db
    .update(submissions)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(submissions.id, id));

  if (current.canonicalIncidentId) {
    await db
      .update(incidents)
      .set({ publicationState: "withdrawn", updatedAt: new Date() })
      .where(eq(incidents.id, current.canonicalIncidentId));
  }

  await db.insert(reviewsAndFlags).values({
    targetType: "submission",
    targetId: id,
    actorId: ownerId,
    action: "withdrawn",
    reason: "reporter_withdrawal",
  });

  return true;
}
