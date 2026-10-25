CREATE TYPE "public"."contact_type" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."incident_category" AS ENUM('robbery_force', 'snatching', 'pickpocketing', 'other_theft', 'attempted');--> statement-breakpoint
CREATE TYPE "public"."injury" AS ENUM('yes', 'no', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('street', 'area');--> statement-breakpoint
CREATE TYPE "public"."offender_band" AS ENUM('one', 'two', 'three', 'four', 'five_plus', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('draft', 'published', 'temporarily_hidden', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('victim', 'witness');--> statement-breakpoint
CREATE TYPE "public"."review_label" AS ENUM('community_reviewed', 'supporting_reviewed', 'independently_corroborated', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('reporter', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'under_review', 'published', 'needs_clarification', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."time_band" AS ENUM('band_0_6', 'band_6_12', 'band_12_18', 'band_18_24', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."time_precision" AS ENUM('exact', 'approximate', 'band', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."weapon_type" AS ENUM('firearm', 'blade', 'other', 'unknown');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_encrypted" text NOT NULL,
	"contact_hash" text NOT NULL,
	"contact_type" "contact_type" NOT NULL,
	"verified_at" timestamp with time zone,
	"role" "role" DEFAULT 'reporter' NOT NULL,
	"mfa_secret_encrypted" text,
	"consent_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"status_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"time_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excluded_count" integer DEFAULT 0 NOT NULL,
	"rule_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"launch_polygon_geojson" jsonb,
	"grid_resolution" integer DEFAULT 9 NOT NULL,
	"thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retention_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_version" text DEFAULT '2026.10.0' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_type" text NOT NULL,
	"size" integer NOT NULL,
	"checksum" text NOT NULL,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"metadata_stripped" boolean DEFAULT false NOT NULL,
	"expiry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"category" "incident_category" NOT NULL,
	"occurrence_date" date NOT NULL,
	"time_band" time_band DEFAULT 'unknown' NOT NULL,
	"cell_id" text,
	"broad_area" text,
	"redacted_narrative" text NOT NULL,
	"items_taken_public" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offender_band" "offender_band",
	"weapon_flag" boolean DEFAULT false NOT NULL,
	"injury_flag" boolean DEFAULT false NOT NULL,
	"review_label" "review_label" DEFAULT 'community_reviewed' NOT NULL,
	"publication_state" "publication_state" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"corrected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews_and_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"before_version" integer,
	"after_version" integer,
	"evidence_review_basis" text,
	"appeal_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"canonical_incident_id" uuid,
	"category" "incident_category" NOT NULL,
	"relationship" "relationship" NOT NULL,
	"original_text" text NOT NULL,
	"structured_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrence_local_date" date NOT NULL,
	"occurrence_time" time,
	"time_precision" time_precision DEFAULT 'unknown' NOT NULL,
	"raw_lat" double precision,
	"raw_lng" double precision,
	"cell_id" text,
	"broad_area" text,
	"location_precision" "location_precision" DEFAULT 'street' NOT NULL,
	"weapon_reported" boolean,
	"weapon_type" "weapon_type",
	"injury" "injury",
	"offender_band" "offender_band",
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuration" ADD CONSTRAINT "configuration_updated_by_accounts_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews_and_flags" ADD CONSTRAINT "reviews_and_flags_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_canonical_incident_id_incidents_id_fk" FOREIGN KEY ("canonical_incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_contact_hash_idx" ON "accounts" USING btree ("contact_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "aggregates_cell_window_rule_idx" ON "aggregates" USING btree ("cell_id","window_start","window_end","rule_version");--> statement-breakpoint
CREATE INDEX "evidence_submission_idx" ON "evidence" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_public_id_idx" ON "incidents" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "incidents_pub_date_cell_idx" ON "incidents" USING btree ("publication_state","occurrence_date","cell_id");--> statement-breakpoint
CREATE INDEX "reviews_target_idx" ON "reviews_and_flags" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_owner_idem_idx" ON "submissions" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "submissions_owner_idx" ON "submissions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "submissions_canonical_idx" ON "submissions" USING btree ("canonical_incident_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");