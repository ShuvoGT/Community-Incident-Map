import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema";
import { createSession } from "@/server/services/auth";
import { encryptContact, hashContact } from "@/server/crypto";
import { json, error, handleError } from "@/server/http";

// TEST-ONLY authentication shortcut for the acceptance suite. Creates (or
// reuses) an account with the given role and issues a full session, skipping
// the OTP round-trip. Hard-disabled unless ENABLE_TEST_AUTH=1, and never in
// production.
function enabled() {
  return (
    process.env.ENABLE_TEST_AUTH === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["reporter", "moderator", "admin"]).default("reporter"),
});

export async function POST(req: Request) {
  if (!enabled()) return error("Not found", 404);
  try {
    const { email, role } = schema.parse(await req.json());
    const contactHash = hashContact(email);

    const [existing] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.contactHash, contactHash))
      .limit(1);

    let accountId: string;
    if (existing) {
      await db.update(accounts).set({ role }).where(eq(accounts.id, existing.id));
      accountId = existing.id;
    } else {
      const [created] = await db
        .insert(accounts)
        .values({
          contactEncrypted: encryptContact(email),
          contactHash,
          contactType: "email",
          role,
          verifiedAt: new Date(),
        })
        .returning({ id: accounts.id });
      accountId = created.id;
    }

    await createSession(accountId);
    return json({ ok: true, accountId, role });
  } catch (e) {
    return handleError(e);
  }
}
