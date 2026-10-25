import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts, submissions } from "../db/schema";
import { encryptContact, hashContact } from "../crypto";
import {
  createSubmission,
  correctSubmission,
  withdrawSubmission,
} from "../services/submissions";
import { publishSubmission } from "../services/moderation";
import {
  getPublicIncident,
  listPublicIncidents,
  getHotspots,
} from "../services/publicRead";
import { bandForCount } from "../services/aggregates";
import { dhakaToday } from "@/lib/time";

/**
 * Live end-to-end lifecycle check against the running database:
 *   report -> approve (publish) -> correct -> withdraw
 * Exercises H3 cell derivation + raw-coordinate discard, the public read
 * model and hotspot aggregation. Run with: npm run smoke
 */

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.info(`  ✓ ${msg}`);
}

async function ensureAccount(contact: string, role: "reporter" | "moderator") {
  const contactHash = hashContact(contact);
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.contactHash, contactHash))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(accounts)
    .values({
      contactEncrypted: encryptContact(contact),
      contactHash,
      contactType: "email",
      role,
      verifiedAt: new Date(),
    })
    .returning({ id: accounts.id });
  return created.id;
}

async function main() {
  const stamp = Date.now();
  const reporterId = await ensureAccount(`reporter+${stamp}@dev.test`, "reporter");
  const moderatorId = await ensureAccount(`mod+${stamp}@dev.test`, "moderator");
  const today = dhakaToday();

  console.info("\n1) Reporter submits an incident");
  const created = await createSubmission(
    reporterId,
    {
      category: "snatching",
      relationship: "victim",
      locationPrecision: "street",
      lat: 23.7806,
      lng: 90.4074,
      occurrenceDate: today,
      occurrenceTime: "20:30",
      timePrecision: "exact",
      experience:
        "Two people on a motorcycle grabbed my phone near the corner and rode off quickly.",
      consent: true,
    },
    `smoke-${stamp}`,
  );
  assert(created.status === "submitted", "submission created with status 'submitted'");

  const [row] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, created.id))
    .limit(1);
  assert(row.cellId, `H3 cell derived server-side (${row.cellId})`);
  assert(row.rawLat === null && row.rawLng === null, "raw coordinate discarded");
  const cell = row.cellId!;

  console.info("\n2) Idempotency: a retry returns the same submission");
  const retry = await createSubmission(
    reporterId,
    {
      category: "snatching",
      relationship: "victim",
      locationPrecision: "street",
      lat: 23.7806,
      lng: 90.4074,
      occurrenceDate: today,
      occurrenceTime: "20:30",
      timePrecision: "exact",
      experience:
        "Two people on a motorcycle grabbed my phone near the corner and rode off quickly.",
      consent: true,
    },
    `smoke-${stamp}`,
  );
  assert(retry.id === created.id, "retry with same idempotency key did not create a duplicate");

  // Baseline count for this cell (may be non-zero if a previous run left
  // published incidents in the same cell — the assertions are relative).
  const baseline =
    (await getHotspots()).cells.find((c) => c.cellId === cell)?.count ?? 0;

  console.info("\n3) Moderator publishes a redacted version");
  const published = await publishSubmission(moderatorId, created.id, {
    redactedNarrative:
      "The reporter describes two people on a motorcycle snatching a phone before riding away.",
  });
  assert(published.publicId, `public incident created (${published.publicId})`);

  const pub = await getPublicIncident(published.publicId);
  assert(pub !== null, "approved incident is publicly retrievable");
  assert(!("originalText" in (pub as object)), "public record exposes no original narrative field");
  assert(pub!.weaponFlag === false, "weapon flag defaults to false");

  const listed = await listPublicIncidents({ from: today, to: today });
  assert(
    listed.some((i) => i.publicId === published.publicId),
    "incident appears in the public list",
  );

  console.info("\n4) Hotspot aggregate reflects the published incident");
  let hs = await getHotspots();
  const afterPublish = hs.cells.find((c) => c.cellId === cell);
  assert(afterPublish !== undefined, "cell present in hotspot layer");
  assert(
    afterPublish!.count === baseline + 1,
    `count incremented by 1 (${baseline} -> ${afterPublish!.count})`,
  );
  assert(
    afterPublish!.band === bandForCount(baseline + 1),
    `band matches threshold rule (${afterPublish!.band})`,
  );
  assert(hs.timezone === "Asia/Dhaka" && !!hs.ruleVersion, "hotspot response carries timezone + rule version");

  console.info("\n5) Reporter corrects the report");
  const [beforeCorrect] = await db
    .select({ version: submissions.version })
    .from(submissions)
    .where(eq(submissions.id, created.id))
    .limit(1);
  await correctSubmission(reporterId, created.id, {
    experience:
      "Correction: it was two people on a motorcycle who snatched my phone near the market corner.",
  });
  const [afterCorrect] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, created.id))
    .limit(1);
  assert(afterCorrect.status === "under_review", "correction sets status back to 'under_review'");
  assert(
    afterCorrect.version === beforeCorrect.version + 1,
    `submission version incremented (${beforeCorrect.version} -> ${afterCorrect.version})`,
  );
  const stillPublic = await getPublicIncident(published.publicId);
  assert(stillPublic !== null, "public page unchanged until a moderator republishes");

  console.info("\n6) Reporter withdraws the report");
  await withdrawSubmission(reporterId, created.id);
  const afterWithdraw = await getPublicIncident(published.publicId);
  assert(afterWithdraw === null, "withdrawn incident is no longer publicly retrievable");
  hs = await getHotspots();
  const afterCell = hs.cells.find((c) => c.cellId === cell);
  const finalCount = afterCell?.count ?? 0;
  assert(
    finalCount === baseline,
    `cell count returned to baseline after withdrawal (${finalCount})`,
  );

  console.info("\n✅ Lifecycle verified: report → approve → correct → withdraw");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\n❌", err);
    process.exit(1);
  },
);
