import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { aggregates, incidents } from "../db/schema";
import { cellBoundaryGeoJson, cellCenter } from "@/lib/h3";
import { rollingWindow, sevenDayWindow } from "@/lib/time";
import { bandForCount, RULE_VERSION, type Band } from "./aggregates";

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

  // Broad-area reports are counted in totals but excluded from the grid; the
  // excluded count is disclosed alongside the layer.
  const [{ excluded }] = await db
    .select({ excluded: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        eq(incidents.publicationState, "published"),
        gte(incidents.occurrenceDate, window.start),
        lte(incidents.occurrenceDate, window.end),
        sql`${incidents.cellId} is null`,
      ),
    );

  return {
    scale: "weekly" as const,
    cells,
    excludedBroadArea: Number(excluded),
    dateRange: { start: window.start, end: window.end },
    timezone: "Asia/Dhaka",
    ruleVersion: RULE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

// Weekly headline stats for the dashboard. All derived from published
// incidents in the rolling seven-day window.
export async function getWeeklyStats(now: Date = new Date()) {
  const window = sevenDayWindow(now);
  const rows = await db
    .select({
      category: incidents.category,
      cellId: incidents.cellId,
      weaponFlag: incidents.weaponFlag,
      injuryFlag: incidents.injuryFlag,
    })
    .from(incidents)
    .where(
      and(
        eq(incidents.publicationState, "published"),
        gte(incidents.occurrenceDate, window.start),
        lte(incidents.occurrenceDate, window.end),
      ),
    );

  const perCell = new Map<string, number>();
  const byCategory: Record<string, number> = {};
  let weaponCount = 0;
  let injuryCount = 0;
  let excludedBroadArea = 0;

  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (r.weaponFlag) weaponCount++;
    if (r.injuryFlag) injuryCount++;
    if (r.cellId) perCell.set(r.cellId, (perCell.get(r.cellId) ?? 0) + 1);
    else excludedBroadArea++;
  }

  const bandCounts = { yellow: 0, amber: 0, red: 0 };
  let topArea: { cellId: string; count: number; band: Band } | null = null;
  for (const [cellId, count] of perCell) {
    const band = bandForCount(count);
    if (band !== "grey") bandCounts[band]++;
    if (!topArea || count > topArea.count) topArea = { cellId, count, band };
  }

  return {
    total: rows.length,
    activeCells: perCell.size,
    weaponCount,
    injuryCount,
    excludedBroadArea,
    byCategory,
    bandCounts,
    topArea,
    dateRange: { start: window.start, end: window.end },
    timezone: "Asia/Dhaka",
    ruleVersion: RULE_VERSION,
  };
}

// Filtered layer (30-day, category, time band). Computed live from published
// incidents and returned on a NEUTRAL scale — never the weekly colour bands.
export async function getFilteredHotspots(
  opts: { days: number; category?: string; timeBand?: string },
  now: Date = new Date(),
) {
  const window = rollingWindow(opts.days, now);
  const conditions = [
    eq(incidents.publicationState, "published"),
    gte(incidents.occurrenceDate, window.start),
    lte(incidents.occurrenceDate, window.end),
    sql`${incidents.cellId} is not null`,
  ];
  if (opts.category) {
    conditions.push(eq(incidents.category, opts.category as never));
  }
  if (opts.timeBand) {
    conditions.push(eq(incidents.timeBand, opts.timeBand as never));
  }

  const rows = await db
    .select({
      cellId: incidents.cellId,
      count: sql<number>`count(*)::int`,
    })
    .from(incidents)
    .where(and(...conditions))
    .groupBy(incidents.cellId);

  const cells = rows
    .filter((r) => r.cellId)
    .map((r) => ({
      cellId: r.cellId!,
      count: Number(r.count),
      center: cellCenter(r.cellId!),
      boundary: cellBoundaryGeoJson(r.cellId!),
    }));

  return {
    scale: "filtered" as const,
    cells,
    dateRange: { start: window.start, end: window.end },
    filters: {
      days: opts.days,
      category: opts.category ?? null,
      timeBand: opts.timeBand ?? null,
    },
    timezone: "Asia/Dhaka",
    generatedAt: new Date().toISOString(),
  };
}

// Summary for one cell over a window: count, breakdowns and the public
// incidents in it. Time-band breakdown is suppressed for small cells (<5).
export async function getAreaSummary(
  cell: string,
  days = 7,
  now: Date = new Date(),
) {
  const window = rollingWindow(days, now);

  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(incidents)
    .where(
      and(
        eq(incidents.cellId, cell),
        eq(incidents.publicationState, "published"),
        gte(incidents.occurrenceDate, window.start),
        lte(incidents.occurrenceDate, window.end),
      ),
    )
    .orderBy(desc(incidents.occurrenceDate));

  const tally = (keys: (string | null)[]) => {
    const out: Record<string, number> = {};
    for (const k of keys) out[k ?? "unknown"] = (out[k ?? "unknown"] ?? 0) + 1;
    return out;
  };

  const count = rows.length;
  return {
    cellId: cell,
    count,
    band: days === 7 ? bandForCount(count) : null,
    center: cellCenter(cell),
    dateRange: { start: window.start, end: window.end },
    categoryBreakdown: tally(rows.map((r) => r.category)),
    statusBreakdown: tally(rows.map((r) => r.reviewLabel)),
    // Suppress time-band detail for sparse cells to avoid re-identification.
    timeBreakdown: count >= 5 ? tally(rows.map((r) => r.timeBand)) : null,
    weaponCount: rows.filter((r) => r.weaponFlag).length,
    injuryCount: rows.filter((r) => r.injuryFlag).length,
    incidents: rows,
    timezone: "Asia/Dhaka",
    ruleVersion: RULE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
