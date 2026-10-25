import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { aggregates, incidents } from "../db/schema";
import { sevenDayWindow } from "@/lib/time";

// Bump when the counting rule or thresholds change. Historical exports keep
// their own recorded rule_version; never silently reinterpret them.
export const RULE_VERSION = "2026.10.0";

export type Band = "grey" | "yellow" | "amber" | "red";

// Initial product thresholds (not validated risk levels). Non-overlapping:
// 0, 1–4, 5–9, 10+. Never green / "safe".
export function bandForCount(count: number): Band {
  if (count <= 0) return "grey";
  if (count <= 4) return "yellow";
  if (count <= 9) return "amber";
  return "red";
}

function tally(rows: { key: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.key ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// Recompute the rolling seven-day aggregate for a single cell and upsert it.
export async function recomputeCellWindow(
  cellId: string,
  now: Date = new Date(),
): Promise<void> {
  const window = sevenDayWindow(now);

  const rows = await db
    .select({
      category: incidents.category,
      timeBand: incidents.timeBand,
      reviewLabel: incidents.reviewLabel,
    })
    .from(incidents)
    .where(
      and(
        eq(incidents.cellId, cellId),
        eq(incidents.publicationState, "published"),
        gte(incidents.occurrenceDate, window.start),
        lte(incidents.occurrenceDate, window.end),
      ),
    );

  const count = rows.length;
  const categoryBreakdown = tally(rows.map((r) => ({ key: r.category })));
  const timeBreakdown = tally(rows.map((r) => ({ key: r.timeBand })));
  const statusBreakdown = tally(rows.map((r) => ({ key: r.reviewLabel })));

  await db
    .insert(aggregates)
    .values({
      cellId,
      windowStart: window.start,
      windowEnd: window.end,
      count,
      categoryBreakdown,
      timeBreakdown,
      statusBreakdown,
      excludedCount: 0,
      ruleVersion: RULE_VERSION,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        aggregates.cellId,
        aggregates.windowStart,
        aggregates.windowEnd,
        aggregates.ruleVersion,
      ],
      set: {
        count,
        categoryBreakdown,
        timeBreakdown,
        statusBreakdown,
        computedAt: new Date(),
      },
    });
}

// Recompute every cell that has published incidents in the current window.
export async function recomputeAllWindows(now: Date = new Date()): Promise<number> {
  const window = sevenDayWindow(now);
  const cells = await db
    .selectDistinct({ cellId: incidents.cellId })
    .from(incidents)
    .where(
      and(
        eq(incidents.publicationState, "published"),
        gte(incidents.occurrenceDate, window.start),
        lte(incidents.occurrenceDate, window.end),
        sql`${incidents.cellId} is not null`,
      ),
    );

  for (const { cellId } of cells) {
    if (cellId) await recomputeCellWindow(cellId, now);
  }
  return cells.length;
}
