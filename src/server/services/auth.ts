import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { sessions, accounts } from "../db/schema";
import { generateSessionToken, hashToken } from "../crypto";

const SESSION_COOKIE = "ci_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

export type SessionAccount = {
  id: string;
  role: "reporter" | "moderator" | "admin";
};

// Issue a session, store only its hash, and set the cookie.
export async function createSession(accountId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    accountId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionAccount(): Promise<SessionAccount | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ id: accounts.id, role: accounts.role })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function requireAccount(): Promise<SessionAccount> {
  const account = await getSessionAccount();
  if (!account) throw new UnauthorizedError();
  return account;
}

export async function requireStaff(): Promise<SessionAccount> {
  const account = await requireAccount();
  if (account.role !== "moderator" && account.role !== "admin") {
    throw new ForbiddenError();
  }
  return account;
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
