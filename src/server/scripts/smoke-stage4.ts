import "dotenv/config";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  accounts,
  submissions,
  configuration,
  reviewsAndFlags,
} from "../db/schema";
import { encryptContact, hashContact } from "../crypto";
import { getConfig, updateConfig, getRateLimits } from "../services/config";
import {
  createSubmission,
  DailySubmissionLimitError,
} from "../services/submissions";
import { beginEnrollment, verifyTotp, verifyChallenge } from "../services/mfa";
import { buildAggregateCsv } from "../services/export";
import { runRetention } from "../services/retention";
import { csvCell } from "@/lib/csv";
import { dhakaToday } from "@/lib/time";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.info(`  ✓ ${msg}`);
}

async function main() {
  console.info("\n1) Config: defaults + merge update");
  const cfg = await getConfig();
  assert(cfg.gridResolution === 9, "default grid resolution is 9");
  const admin = (
    await db
      .insert(accounts)
      .values({
        contactEncrypted: encryptContact(`s4admin-${Date.now()}@dev.test`),
        contactHash: hashContact(`s4admin-${Date.now()}@dev.test`),
        contactType: "email",
        role: "admin",
        verifiedAt: new Date(),
      })
      .returning({ id: accounts.id })
  )[0];
  await updateConfig(admin.id, { rateLimits: { submissionsPerContactPerDay: 3 } });
  const limits = await getRateLimits();
  assert(limits.submissionsPerContactPerDay === 3, "rate-limit update merged");

  console.info("\n2) Rate limit: 4th submission in a day is rejected");
  const repContact = `s4rep-${Date.now()}@dev.test`;
  const rep = (
    await db
      .insert(accounts)
      .values({
        contactEncrypted: encryptContact(repContact),
        contactHash: hashContact(repContact),
        contactType: "email",
        role: "reporter",
        verifiedAt: new Date(),
      })
      .returning({ id: accounts.id })
  )[0];
  const mk = (i: number) =>
    createSubmission(
      rep.id,
      {
        category: "snatching",
        relationship: "victim",
        locationPrecision: "area",
        broadArea: "Test",
        occurrenceDate: dhakaToday(),
        timePrecision: "unknown",
        experience:
          "A rate-limit test submission that is at least thirty characters long.",
        consent: true,
      },
      `s4-${rep.id}-${i}`,
    );
  await mk(1);
  await mk(2);
  await mk(3);
  let capped = false;
  try {
    await mk(4);
  } catch (e) {
    capped = e instanceof DailySubmissionLimitError;
  }
  assert(capped, "4th same-day submission throws DailySubmissionLimitError");

  console.info("\n3) MFA (TOTP): enroll + verify");
  const enroll = beginEnrollment("s4-staff");
  const good = authenticator.generate(enroll.secret);
  assert(verifyTotp(enroll.secret, good), "valid TOTP verifies");
  assert(!verifyTotp(enroll.secret, "000000"), "wrong TOTP rejected");
  assert(
    verifyChallenge(encryptContact(enroll.secret), authenticator.generate(enroll.secret)),
    "challenge verifies against the encrypted stored secret",
  );

  console.info("\n4) CSV export: formula-injection safe + builds");
  assert(csvCell("=1+1").startsWith("'"), "formula-leading cell is neutralised");
  assert(csvCell('a,b"c').startsWith('"'), "comma/quote cell is quoted");
  const exp = await buildAggregateCsv(admin.id, 7);
  assert(exp.csv.includes("cell_id") && exp.csv.includes("rule_version"), "CSV has expected header");

  console.info("\n5) Retention: runs and returns a summary");
  const summary = await runRetention();
  assert(
    typeof summary.auditLogsPurged === "number",
    `retention summary returned (${JSON.stringify(summary)})`,
  );

  // Cleanup test submissions and accounts. Clear the config's updated_by
  // reference first so the admin row can be removed.
  await db.delete(submissions).where(eq(submissions.ownerId, rep.id));
  await db
    .update(configuration)
    .set({ updatedBy: null })
    .where(eq(configuration.updatedBy, admin.id));
  await db.delete(reviewsAndFlags).where(eq(reviewsAndFlags.actorId, admin.id));
  await db.delete(accounts).where(eq(accounts.id, rep.id));
  await db.delete(accounts).where(eq(accounts.id, admin.id));

  console.info("\n✅ Stage 4 behaviours verified");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\n❌", err);
    process.exit(1);
  },
);
