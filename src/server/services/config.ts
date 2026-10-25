import { eq } from "drizzle-orm";
import { db } from "../db";
import { configuration, reviewsAndFlags } from "../db/schema";
import { RULE_VERSION } from "./aggregates";

// Proposed launch defaults (configurable; evaluated during the pilot).
export const DEFAULT_THRESHOLDS = { yellowMin: 1, amberMin: 5, redMin: 10 };
export const DEFAULT_RATE_LIMITS = {
  submissionsPerContactPerDay: 3,
  otpPerContactPerHour: 5,
  ipPerMinute: 30,
};
export const DEFAULT_RETENTION = {
  rejectedAbandonedDays: 30,
  evidenceNarrativeDays: 90,
  publicIncidentMonths: 12,
  inactiveAccountMonths: 12,
  auditLogDays: 180,
};

export type RateLimits = typeof DEFAULT_RATE_LIMITS;
export type Retention = typeof DEFAULT_RETENTION;

// Fetch the singleton config row, creating it with defaults on first use.
export async function getConfig() {
  const [existing] = await db
    .select()
    .from(configuration)
    .where(eq(configuration.key, "global"))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(configuration)
    .values({
      key: "global",
      gridResolution: 9,
      thresholds: DEFAULT_THRESHOLDS,
      rateLimits: DEFAULT_RATE_LIMITS,
      retentionPolicy: DEFAULT_RETENTION,
      translations: {},
      ruleVersion: RULE_VERSION,
    })
    .returning();
  return created;
}

export async function getRateLimits(): Promise<RateLimits> {
  const cfg = await getConfig();
  return { ...DEFAULT_RATE_LIMITS, ...(cfg.rateLimits as Partial<RateLimits>) };
}

export async function getRetention(): Promise<Retention> {
  const cfg = await getConfig();
  return { ...DEFAULT_RETENTION, ...(cfg.retentionPolicy as Partial<Retention>) };
}

type ConfigPatch = {
  rateLimits?: Partial<RateLimits>;
  retentionPolicy?: Partial<Retention>;
  thresholds?: Record<string, number>;
  launchPolygonGeojson?: unknown;
  translations?: Record<string, unknown>;
  ruleVersion?: string;
};

// Audited admin update. Objects are merged so a partial patch is safe.
export async function updateConfig(adminId: string, patch: ConfigPatch) {
  const current = await getConfig();
  const [updated] = await db
    .update(configuration)
    .set({
      rateLimits: { ...(current.rateLimits as object), ...(patch.rateLimits ?? {}) },
      retentionPolicy: {
        ...(current.retentionPolicy as object),
        ...(patch.retentionPolicy ?? {}),
      },
      thresholds: { ...(current.thresholds as object), ...(patch.thresholds ?? {}) },
      launchPolygonGeojson:
        patch.launchPolygonGeojson ?? current.launchPolygonGeojson,
      translations: patch.translations ?? current.translations,
      ruleVersion: patch.ruleVersion ?? current.ruleVersion,
      updatedBy: adminId,
      updatedAt: new Date(),
    })
    .where(eq(configuration.key, "global"))
    .returning();

  await db.insert(reviewsAndFlags).values({
    targetType: "configuration",
    targetId: updated.id,
    actorId: adminId,
    action: "config_updated",
    reason: JSON.stringify(Object.keys(patch)),
  });

  return updated;
}
