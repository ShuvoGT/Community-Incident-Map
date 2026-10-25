import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { verificationCodes, accounts } from "../db/schema";
import {
  encryptContact,
  hashContact,
  hashToken,
  generateOtp,
  constantTimeEqual,
} from "../crypto";
import { env } from "../env";

const CODE_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_ATTEMPTS = 5;

type Channel = "email" | "phone";

// Pluggable delivery. In dev we log the code; email/SMS adapters are wired in
// behind this interface without changing callers.
async function deliverCode(
  contact: string,
  channel: Channel,
  code: string,
): Promise<void> {
  if (!env.isProd) {
    // Never log codes in production.
    console.info(`[verification] ${channel} code for ${contact}: ${code}`);
    return;
  }
  // TODO: real SMTP / SMS provider adapter (env.verificationChannel).
  throw new Error("No verification delivery adapter configured");
}

export async function requestVerification(
  contact: string,
  channel: Channel,
): Promise<void> {
  const contactHash = hashContact(contact);
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.insert(verificationCodes).values({
    contactHash,
    contactEncrypted: encryptContact(contact),
    contactType: channel,
    codeHash: hashToken(code),
    expiresAt,
  });

  await deliverCode(contact, channel, code);
}

export type VerifyResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: "expired" | "invalid" | "too_many_attempts" };

// Confirm a code. On success, ensures a verified account exists for the
// contact and returns its id. The raw code is never stored.
export async function confirmVerification(
  contact: string,
  channel: Channel,
  code: string,
): Promise<VerifyResult> {
  const contactHash = hashContact(contact);

  const [record] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.contactHash, contactHash),
        isNull(verificationCodes.consumedAt),
        gt(verificationCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(verificationCodes.createdAt)
    .limit(1);

  if (!record) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  if (!constantTimeEqual(record.codeHash, hashToken(code))) {
    await db
      .update(verificationCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(verificationCodes.id, record.id));
    return { ok: false, reason: "invalid" };
  }

  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodes.id, record.id));

  // Find-or-create the account for this contact.
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.contactHash, contactHash))
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({ verifiedAt: new Date(), lastActiveAt: new Date() })
      .where(eq(accounts.id, existing.id));
    return { ok: true, accountId: existing.id };
  }

  const [created] = await db
    .insert(accounts)
    .values({
      contactEncrypted: encryptContact(contact),
      contactHash,
      contactType: channel,
      role: "reporter",
      verifiedAt: new Date(),
      lastActiveAt: new Date(),
    })
    .returning({ id: accounts.id });

  return { ok: true, accountId: created.id };
}
