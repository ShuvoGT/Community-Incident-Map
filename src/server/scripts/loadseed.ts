import "dotenv/config";
import { db } from "../db";
import { incidents } from "../db/schema";
import { newPublicId } from "@/lib/ids";
import { deriveCell } from "@/lib/h3";
import { rollingWindow } from "@/lib/time";
import { recomputeAllWindows } from "../services/aggregates";

/**
 * Bulk-seed synthetic published incidents for load testing (default 50,000),
 * inserting directly (bypassing services/rate limits) across ~200 cells.
 *   npm run loadseed -- 50000
 */
const TOTAL = Number(process.argv[2] ?? "50000");
const CELL_COUNT = 200;
const CATEGORIES = [
  "robbery_force",
  "snatching",
  "pickpocketing",
  "other_theft",
  "attempted",
] as const;
const TIME_BANDS = ["band_0_6", "band_6_12", "band_12_18", "band_18_24", "unknown"] as const;

const rand = (n: number) => Math.floor(Math.random() * n);

async function main() {
  // A fixed pool of cells (random Dhaka points -> H3), so aggregate recompute
  // stays bounded while counts are realistic.
  const cells: string[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const lat = 23.70 + Math.random() * 0.18;
    const lng = 90.35 + Math.random() * 0.11;
    cells.push(deriveCell(lat, lng));
  }

  const dates = rollingWindow(30).dates;
  const now = new Date();
  const batchSize = 2000;
  let inserted = 0;

  const t0 = Date.now();
  for (let start = 0; start < TOTAL; start += batchSize) {
    const rows = [];
    const end = Math.min(start + batchSize, TOTAL);
    for (let i = start; i < end; i++) {
      rows.push({
        publicId: newPublicId() + newPublicId().slice(0, 4),
        category: CATEGORIES[rand(CATEGORIES.length)],
        occurrenceDate: dates[rand(dates.length)],
        timeBand: TIME_BANDS[rand(TIME_BANDS.length)],
        cellId: cells[rand(cells.length)],
        broadArea: null,
        redactedNarrative: "Synthetic load-test record.",
        itemsTakenPublic: [],
        weaponFlag: Math.random() < 0.1,
        injuryFlag: Math.random() < 0.05,
        reviewLabel: "community_reviewed" as const,
        publicationState: "published" as const,
        publishedAt: now,
      });
    }
    await db.insert(incidents).values(rows);
    inserted += rows.length;
    if (inserted % 10000 === 0) console.info(`  inserted ${inserted}…`);
  }

  console.info(`Inserted ${inserted} incidents in ${Date.now() - t0}ms. Recomputing aggregates…`);
  const t1 = Date.now();
  const n = await recomputeAllWindows();
  console.info(`Recomputed ${n} cell aggregates in ${Date.now() - t1}ms.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
