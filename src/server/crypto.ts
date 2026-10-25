import crypto from "node:crypto";
import { env } from "./env";

// Symmetric key for encrypting private contact details. In production a real
// 32-byte base64 key is required; in dev we fall back to a derived key so the
// app runs out of the box (never use the fallback for real data).
function getKey(): Buffer {
  const raw = env.contactEncryptionKey();
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
    throw new Error("CONTACT_ENCRYPTION_KEY must be 32 bytes (base64)");
  }
  if (env.isProd) {
    throw new Error("CONTACT_ENCRYPTION_KEY is required in production");
  }
  return crypto.createHash("sha256").update("dev-insecure-contact-key").digest();
}

const normalise = (contact: string) => contact.trim().toLowerCase();

// AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext).
export function encryptContact(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptContact(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

// Deterministic keyed hash for lookup + rate limiting (never reversible).
export function hashContact(contact: string): string {
  return crypto
    .createHmac("sha256", getKey())
    .update(normalise(contact))
    .digest("hex");
}

// One-way hash for opaque tokens (session tokens, OTP codes).
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 6-digit numeric OTP, uniformly distributed.
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// URL-safe opaque session token.
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
