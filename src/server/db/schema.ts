/**
 * Database schema for the Dhaka Community Incident Map.
 *
 * Two worlds live here, kept physically separate:
 *   - PRIVATE store: accounts, submissions, evidence, reviews — raw narrative,
 *     contact, evidence, transient coordinates. Never exposed publicly.
 *   - PUBLIC read model: incidents (redacted), aggregates — only safe,
 *     moderated, cell-based fields.
 *
 * System timestamps are UTC (timestamptz). Occurrence dates/times are stored
 * as local Dhaka date/time plus an explicit precision; an unknown time is null
 * and must never be fabricated as midnight.
 */
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ── Enums ──────────────────────────────────────────────────────── */

export const roleEnum = pgEnum("role", ["reporter", "moderator", "admin"]);
export const contactTypeEnum = pgEnum("contact_type", ["email", "phone"]);

export const incidentCategoryEnum = pgEnum("incident_category", [
  "robbery_force", // robbery with force or threat
  "snatching",
  "pickpocketing",
  "other_theft",
  "attempted", // attempted robbery or theft
]);

export const relationshipEnum = pgEnum("relationship", ["victim", "witness"]);

export const timePrecisionEnum = pgEnum("time_precision", [
  "exact",
  "approximate",
  "band",
  "unknown",
]);

export const locationPrecisionEnum = pgEnum("location_precision", [
  "street", // approximate street segment
  "area", // broader area (may be excluded from the hotspot grid)
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "draft",
  "submitted",
  "under_review",
  "published",
  "needs_clarification",
  "rejected",
  "merged",
]);

export const publicationStateEnum = pgEnum("publication_state", [
  "draft",
  "published",
  "temporarily_hidden",
  "withdrawn",
]);

export const reviewLabelEnum = pgEnum("review_label", [
  "community_reviewed", // passed moderation; not independently confirmed
  "supporting_reviewed", // private material inspected; authenticity may be uncertain
  "independently_corroborated", // documented independent source + basis
  "disputed", // disputed and under review
]);

// 00:00–05:59, 06:00–11:59, 12:00–17:59, 18:00–23:59 Asia/Dhaka, plus unknown.
export const timeBandEnum = pgEnum("time_band", [
  "band_0_6",
  "band_6_12",
  "band_12_18",
  "band_18_24",
  "unknown",
]);

export const weaponTypeEnum = pgEnum("weapon_type", [
  "firearm",
  "blade",
  "other",
  "unknown",
]);

export const injuryEnum = pgEnum("injury", ["yes", "no", "prefer_not_to_say"]);

export const offenderBandEnum = pgEnum("offender_band", [
  "one",
  "two",
  "three",
  "four",
  "five_plus",
  "unknown",
]);

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "clean",
  "infected",
  "failed",
]);

/* ── Private store ──────────────────────────────────────────────── */

// Reporter/staff accounts. No public profile ever. Contact is encrypted;
// contact_hash is a deterministic hash used only for lookup + rate limiting.
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactEncrypted: text("contact_encrypted").notNull(),
    contactHash: text("contact_hash").notNull(),
    contactType: contactTypeEnum("contact_type").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    role: roleEnum("role").notNull().default("reporter"),
    // TOTP secret for staff MFA (null for reporters).
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    consentVersions: jsonb("consent_versions").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("accounts_contact_hash_idx").on(t.contactHash)],
);

// Canonical event that feeds the public read model. One incident, many
// submissions. Holds only redacted / safe fields.
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Short, stable, shareable public identifier.
    publicId: text("public_id").notNull(),
    category: incidentCategoryEnum("category").notNull(),
    occurrenceDate: date("occurrence_date").notNull(),
    timeBand: timeBandEnum("time_band").notNull().default("unknown"),
    cellId: text("cell_id"), // H3 res-9 index; null => excluded from grid
    broadArea: text("broad_area"),
    redactedNarrative: text("redacted_narrative").notNull(),
    itemsTakenPublic: jsonb("items_taken_public").notNull().default([]),
    offenderBand: offenderBandEnum("offender_band"),
    weaponFlag: boolean("weapon_flag").notNull().default(false),
    injuryFlag: boolean("injury_flag").notNull().default(false),
    reviewLabel: reviewLabelEnum("review_label")
      .notNull()
      .default("community_reviewed"),
    publicationState: publicationStateEnum("publication_state")
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("incidents_public_id_idx").on(t.publicId),
    // Core hotspot query: eligible published incidents by date + cell.
    index("incidents_pub_date_cell_idx").on(
      t.publicationState,
      t.occurrenceDate,
      t.cellId,
    ),
  ],
);

// A single reporter account of an event. Private. raw_lat/raw_lng are
// transient: nulled once the H3 cell is derived server-side.
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id),
    canonicalIncidentId: uuid("canonical_incident_id").references(
      () => incidents.id,
    ),
    category: incidentCategoryEnum("category").notNull(),
    relationship: relationshipEnum("relationship").notNull(),
    originalText: text("original_text").notNull(),
    // Structured optional answers (items taken + BDT value, context, lighting,
    // police report ref/doc, weapon/injury detail) kept as a typed blob.
    structuredAnswers: jsonb("structured_answers").notNull().default({}),
    occurrenceLocalDate: date("occurrence_local_date").notNull(),
    occurrenceTime: time("occurrence_time"), // null when unknown
    timePrecision: timePrecisionEnum("time_precision")
      .notNull()
      .default("unknown"),
    rawLat: doublePrecision("raw_lat"), // transient — nulled after cell derivation
    rawLng: doublePrecision("raw_lng"), // transient — nulled after cell derivation
    cellId: text("cell_id"),
    broadArea: text("broad_area"),
    locationPrecision: locationPrecisionEnum("location_precision")
      .notNull()
      .default("street"),
    weaponReported: boolean("weapon_reported"),
    weaponType: weaponTypeEnum("weapon_type"),
    injury: injuryEnum("injury"),
    offenderBand: offenderBandEnum("offender_band"),
    status: submissionStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A retry must never create a second submission for the same account.
    uniqueIndex("submissions_owner_idem_idx").on(t.ownerId, t.idempotencyKey),
    index("submissions_owner_idx").on(t.ownerId),
    index("submissions_canonical_idx").on(t.canonicalIncidentId),
    index("submissions_status_idx").on(t.status),
  ],
);

// Private supporting files. Never publicly downloadable; no permanent URL.
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id),
    objectKey: text("object_key").notNull(),
    fileType: text("file_type").notNull(), // image/jpeg, image/png, application/pdf
    size: integer("size").notNull(),
    checksum: text("checksum").notNull(),
    scanStatus: scanStatusEnum("scan_status").notNull().default("pending"),
    metadataStripped: boolean("metadata_stripped").notNull().default(false),
    expiryAt: timestamp("expiry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("evidence_submission_idx").on(t.submissionId)],
);

// Append-only audit of every moderation action and public flag. Private.
export const reviewsAndFlags = pgTable(
  "reviews_and_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(), // submission | incident
    targetId: uuid("target_id").notNull(),
    actorId: uuid("actor_id").references(() => accounts.id), // null for anonymous flag
    action: text("action").notNull(),
    reason: text("reason"),
    beforeVersion: integer("before_version"),
    afterVersion: integer("after_version"),
    evidenceReviewBasis: text("evidence_review_basis"),
    appealOutcome: text("appeal_outcome"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reviews_target_idx").on(t.targetType, t.targetId)],
);

/* ── Public read model (derived) ────────────────────────────────── */

// Precomputed per-cell window counts. Derived only from eligible canonical
// published incidents. Refreshed every 15 min + on moderation change.
export const aggregates = pgTable(
  "aggregates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cellId: text("cell_id").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    count: integer("count").notNull().default(0),
    statusBreakdown: jsonb("status_breakdown").notNull().default({}),
    categoryBreakdown: jsonb("category_breakdown").notNull().default({}),
    timeBreakdown: jsonb("time_breakdown").notNull().default({}),
    excludedCount: integer("excluded_count").notNull().default(0),
    ruleVersion: text("rule_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("aggregates_cell_window_rule_idx").on(
      t.cellId,
      t.windowStart,
      t.windowEnd,
      t.ruleVersion,
    ),
  ],
);

/* ── Admin configuration (audited) ──────────────────────────────── */

// Singleton-ish config: launch boundary, thresholds, rate limits, retention,
// translations, rule version. launchPolygonGeojson is validated against
// PostGIS; the geometry column itself is added via a raw migration.
export const configuration = pgTable("configuration", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  launchPolygonGeojson: jsonb("launch_polygon_geojson"),
  gridResolution: integer("grid_resolution").notNull().default(9),
  thresholds: jsonb("thresholds").notNull().default({}),
  rateLimits: jsonb("rate_limits").notNull().default({}),
  retentionPolicy: jsonb("retention_policy").notNull().default({}),
  translations: jsonb("translations").notNull().default({}),
  ruleVersion: text("rule_version").notNull().default("2026.10.0"),
  updatedBy: uuid("updated_by").references(() => accounts.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
