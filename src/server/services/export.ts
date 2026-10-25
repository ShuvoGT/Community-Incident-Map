import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { incidents, reviewsAndFlags } from "../db/schema";
import { rollingWindow } from "@/lib/time";
import { toCsv } from "@/lib/csv";
import { RULE_VERSION } from "./aggregates";
import { env } from "../env";

const CATEGORIES = [
  "robbery_force",
  "snatching",
  "pickpocketing",
  "other_theft",
  "attempted",
] as const;
const REVIEW_LABELS = [
  "community_reviewed",
  "supporting_reviewed",
  "independently_corroborated",
  "disputed",
] as const;
const TIME_BANDS = ["band_0_6", "band_6_12", "band_12_18", "band_18_24", "unknown"] as const;

type Row = {
  cellId: string | null;
  broadArea: string | null;
  category: string;
  reviewLabel: string;
  timeBand: string;
  weaponFlag: boolean;
  injuryFlag: boolean;
};

// Build a deduplicated, privacy-protected aggregate CSV for authorities.
// One row per cell: category counts, review-status counts, weapon/injury
// counts and broad time bands (suppressed for cells < 5), plus the excluded
// broad-area total, methodology version, generation time and a source link.
export async function buildAggregateCsv(
  adminId: string,
  days: number,
): Promise<{ filename: string; csv: string }> {
  const window = rollingWindow(days);

  const rows: Row[] = await db
    .select({
      cellId: incidents.cellId,
      broadArea: incidents.broadArea,
      category: incidents.category,
      reviewLabel: incidents.reviewLabel,
      timeBand: incidents.timeBand,
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

  const byCell = new Map<string, Row[]>();
  let excluded = 0;
  for (const r of rows) {
    if (!r.cellId) {
      excluded++; // broad-area submission: counted but excluded from the grid
      continue;
    }
    const list = byCell.get(r.cellId) ?? [];
    list.push(r);
    byCell.set(r.cellId, list);
  }

  const header = [
    "cell_id",
    "broad_area",
    "window_start",
    "window_end",
    "total",
    ...CATEGORIES.map((c) => `cat_${c}`),
    ...REVIEW_LABELS.map((l) => `review_${l}`),
    "weapon_count",
    "injury_count",
    ...TIME_BANDS.map((b) => `time_${b}`),
    "rule_version",
    "generated_at",
    "source_url",
  ];

  const generatedAt = new Date().toISOString();
  const sourceUrl = `${env.appBaseUrl}/`;
  const out: unknown[][] = [];

  for (const [cellId, list] of byCell) {
    const count = (pred: (r: Row) => boolean) => list.filter(pred).length;
    // Suppress time-band detail for sparse cells (< 5) to limit re-identification.
    const showTime = list.length >= 5;
    out.push([
      cellId,
      list[0].broadArea ?? "",
      window.start,
      window.end,
      list.length,
      ...CATEGORIES.map((c) => count((r) => r.category === c)),
      ...REVIEW_LABELS.map((l) => count((r) => r.reviewLabel === l)),
      count((r) => r.weaponFlag),
      count((r) => r.injuryFlag),
      ...TIME_BANDS.map((b) => (showTime ? count((r) => r.timeBand === b) : "")),
      RULE_VERSION,
      generatedAt,
      sourceUrl,
    ]);
  }

  // Excluded broad-area total as a trailing summary row.
  out.push([
    "(broad area — excluded from grid)",
    "",
    window.start,
    window.end,
    excluded,
    ...CATEGORIES.map(() => ""),
    ...REVIEW_LABELS.map(() => ""),
    "",
    "",
    ...TIME_BANDS.map(() => ""),
    RULE_VERSION,
    generatedAt,
    sourceUrl,
  ]);

  // Log the export (declared scope) for the private access audit.
  await db.insert(reviewsAndFlags).values({
    targetType: "configuration",
    targetId: adminId,
    actorId: adminId,
    action: "export_generated",
    reason: `window=${days}d scope=${window.start}..${window.end}`,
  });

  return {
    filename: `incident-aggregate-${window.start}_to_${window.end}.csv`,
    csv: toCsv(header, out),
  };
}
