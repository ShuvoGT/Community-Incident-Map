import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { aggregates, incidents } from "../db/schema";
import { cellBoundaryGeoJson, cellCenter } from "@/lib/h3";
import { sevenDayWindow } from "@/lib/time";
import { bandForCount, RULE_VERSION } from "./aggregates";

// Only ever expose these safe, published fields — never contact, evidence,
// financial loss, original narrative or a raw coordinate.
const PUBLIC_COLUMNS = {
  publicId: incidents.publicId,
  category: incidents.category,
  occurrenceDate: incidents.occurrenceDate,
  timeBand: incidents.timeBand,
  cellId: incidents.cellId,
  broadArea: incidents.broadArea,
  redactedNarrative: incidents.redactedNarrative,
  itemsTakenPublic: incidents.itemsTakenPublic,
  offenderBand: incidents.offenderBand,
  weaponFlag: incidents.weaponFlag,
  injuryFlag: incidents.injuryFlag,
  reviewLabel: incidents.reviewLabel,
  publishedAt: incidents.publishedAt,
  correctedAt: incidents.correctedAt,
};

export async function listPublicIncidents(opts: {
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const conditions = [eq(incidents.publicationState, "published")];
  if (opts.category) {
    conditions.push(eq(incidents.category, opts.category as never));
  }
  if (opts.from) conditions.push(gte(incidents.occurrenceDate, opts.from));
  if (opts.to) conditions.push(lte(incidents.occurrenceDate, opts.to));

  return db
    .select(PUBLIC_COLUMNS)
    .from(incidents)
    .where(and(...conditions))
    .orderBy(desc(incidents.occurrenceDate))
    .limit(Math.min(opts.limit ?? 100, 100));
}

export type PublicIncident = Awaited<
  ReturnType<typeof listPublicIncidents>
>[number];

// Returns the approved public version, or null for anything not currently
// published (the caller renders a neutral "unavailable" page).
export async function getPublicIncident(
  publicId: string,
): Promise<PublicIncident | null> {
  const [row] = await db
    .select(PUBLIC_COLUMNS)
    .from(incidents)
    .where(
      and(
        eq(incidents.publicId, publicId),
        eq(incidents.publicationState, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Current rolling seven-day hotspot layer: one entry per cell with its count,
// band, boundary geometry and centre, plus the window metadata every response
// must carry.
export async function getHotspots(now: Date = new Date()) {
  const window = sevenDayWindow(now);

  const rows = await db
    .select()
    .from(aggregates)
    .where(
      and(
        eq(aggregates.windowStart, window.start),
        eq(aggregates.windowEnd, window.end),
        eq(aggregates.ruleVersion, RULE_VERSION),
      ),
    );

  const cells = rows.map((r) => ({
    cellId: r.cellId,
    count: r.count,
    band: bandForCount(r.count),
    center: cellCenter(r.cellId),
    boundary: cellBoundaryGeoJson(r.cellId),
    categoryBreakdown: r.categoryBreakdown,
    timeBreakdown: r.timeBreakdown,
    statusBreakdown: r.statusBreakdown,
  }));

  return {
    cells,
    dateRange: { start: window.start, end: window.end },
    timezone: "Asia/Dhaka",
    ruleVersion: RULE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
