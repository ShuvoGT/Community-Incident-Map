import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts } from "../db/schema";
import { encryptContact, hashContact } from "../crypto";

/**
 * Dev helper: create or promote a moderator account.
 *   npm run seed:staff -- moderator@dev.test
 * The moderator then signs in via the normal OTP flow (the code is logged to
 * the server console in development).
 */
async function main() {
  const contact = process.argv[2] ?? "moderator@dev.test";
  const role = process.argv[3] === "admin" ? "admin" : "moderator";
  const contactHash = hashContact(contact);

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.contactHash, contactHash))
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({ role })
      .where(eq(accounts.id, existing.id));
    console.info(`Promoted existing account to ${role}: ${contact}`);
  } else {
    await db.insert(accounts).values({
      contactEncrypted: encryptContact(contact),
      contactHash,
      contactType: "email",
      role,
      verifiedAt: new Date(),
    });
    console.info(`Created ${role} account: ${contact}`);
  }

  console.info(
    "Sign in at /login with this email; the OTP prints to this console.",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
