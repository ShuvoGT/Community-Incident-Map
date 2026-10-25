import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts } from "../db/schema";
import { encryptContact, decryptContact } from "../crypto";

const ISSUER = "Dhaka Incident Map";

// Begin enrollment: generate a secret and an otpauth URI for an authenticator
// app. The secret is returned to the enrolling staff member and only stored
// (encrypted) once they prove a code via enableMfa.
export function beginEnrollment(label: string): {
  secret: string;
  otpauthUrl: string;
} {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(label, ISSUER, secret);
  return { secret, otpauthUrl };
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

// Confirm the code against the candidate secret, then store it encrypted.
export async function enableMfa(
  accountId: string,
  secret: string,
  token: string,
): Promise<boolean> {
  if (!verifyTotp(secret, token)) return false;
  await db
    .update(accounts)
    .set({ mfaSecretEncrypted: encryptContact(secret) })
    .where(eq(accounts.id, accountId));
  return true;
}

// Verify a challenge code against the account's stored secret.
export function verifyChallenge(
  mfaSecretEncrypted: string | null,
  token: string,
): boolean {
  if (!mfaSecretEncrypted) return false;
  return verifyTotp(decryptContact(mfaSecretEncrypted), token);
}
