import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts } from "../db/schema";
import { encryptContact, hashContact } from "../crypto";
import { createSubmission } from "../services/submissions";
import { publishSubmission } from "../services/moderation";
import { rollingWindow } from "@/lib/time";
import type { SubmissionCreateInput } from "@/lib/validation";

/**
 * Populate the map with published demo incidents across a few Dhaka cells.
 * Safe to re-run: already-published demo submissions are skipped.
 *   npm run seed:demo
 */

const CATEGORIES = [
  "snatching",
  "robbery_force",
  "pickpocketing",
  "other_theft",
  "attempted",
] as const;

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
  const moderatorId = await ensureAccount("demo-mod@dev.test", "moderator");
  const dates = rollingWindow(30).dates;
  const daysAgo = (n: number) => dates[dates.length - 1 - n];

  // [lat, lng, label, number of incidents, max days ago]
  const clusters: [number, number, string, number, number][] = [
    [23.7456, 90.3756, "Dhanmondi 27", 11, 6], // red, time pattern visible
    [23.792, 90.4143, "Gulshan 1", 6, 6], // amber
    [23.8069, 90.3687, "Mirpur 10", 3, 5], // yellow
    [23.7104, 90.4074, "Jatrabari", 1, 3], // yellow (single)
    [23.7461, 90.3901, "New Market", 2, 20], // appears in 30-day, mostly outside 7
  ];

  const times = ["02:15", "08:40", "14:05", "19:30", "21:50", "23:10"];
  let n = 0;

  for (const [lat, lng, label, count, maxDays] of clusters) {
    for (let i = 0; i < count; i++) {
      const key = `demo-${label}-${i}`;
      // A fresh reporter per incident keeps the demo under the per-contact cap.
      const reporterId = await ensureAccount(
        `demo-rep-${n}-${i}@dev.test`,
        "reporter",
      );
      const withWeapon = i % 5 === 0;
      const input: SubmissionCreateInput = {
        category: CATEGORIES[i % CATEGORIES.length],
        relationship: i % 2 === 0 ? "victim" : "witness",
        locationPrecision: "street",
        lat,
        lng,
        occurrenceDate: daysAgo(i % (maxDays + 1)),
        occurrenceTime: times[i % times.length],
        timePrecision: "approximate",
        experience: `Demo incident near ${label}: a report used to populate the map for development and review purposes only.`,
        weaponReported: withWeapon,
        weaponType: withWeapon ? "blade" : undefined,
        injury: withWeapon ? "yes" : "no",
        consent: true,
      };
      const created = await createSubmission(reporterId, input, key);
      if (created.status === "submitted") {
        await publishSubmission(moderatorId, created.id, {
          redactedNarrative: `The reporter describes ${CATEGORIES[i % CATEGORIES.length].replace("_", " ")} near ${label}.`,
        });
        n++;
      }
    }
  }

  console.info(`Seeded ${n} published demo incident(s) across ${clusters.length} areas.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
