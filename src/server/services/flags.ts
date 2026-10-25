import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { incidents, reviewsAndFlags } from "../db/schema";

// Record a public "report a concern" flag. The flagger is never identified and
// their identity is never disclosed. Flag counts alone never auto-remove a
// report — a moderator reviews. Returns neutrally whether or not the incident
// exists.
export async function recordConcern(
  publicId: string,
  reason: string,
): Promise<void> {
  const [incident] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        eq(incidents.publicId, publicId),
        eq(incidents.publicationState, "published"),
      ),
    )
    .limit(1);

  if (!incident) return;

  await db.insert(reviewsAndFlags).values({
    targetType: "incident",
    targetId: incident.id,
    actorId: null,
    action: "flag",
    reason: reason.slice(0, 500),
  });
}
