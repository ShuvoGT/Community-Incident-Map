import { z } from "zod";
import { isFutureDhakaDate } from "./time";

export const categoryValues = [
  "robbery_force",
  "snatching",
  "pickpocketing",
  "other_theft",
  "attempted",
] as const;

export const relationshipValues = ["victim", "witness"] as const;
export const timePrecisionValues = [
  "exact",
  "approximate",
  "band",
  "unknown",
] as const;
export const locationPrecisionValues = ["street", "area"] as const;
export const offenderBandValues = [
  "one",
  "two",
  "three",
  "four",
  "five_plus",
  "unknown",
] as const;
export const weaponTypeValues = ["firearm", "blade", "other", "unknown"] as const;
export const injuryValues = ["yes", "no", "prefer_not_to_say"] as const;
export const itemValues = [
  "phone",
  "cash",
  "bag",
  "jewellery",
  "vehicle",
  "other",
  "nothing",
  "unknown",
] as const;

/* ── Contact verification ───────────────────────────────────────── */

export const verifyRequestSchema = z.object({
  contactType: z.enum(["email", "phone"]),
  contact: z.string().trim().min(3).max(254),
});
export type VerifyRequestInput = z.infer<typeof verifyRequestSchema>;

export const verifyConfirmSchema = verifyRequestSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/),
});
export type VerifyConfirmInput = z.infer<typeof verifyConfirmSchema>;

/* ── Submission ─────────────────────────────────────────────────── */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const submissionCreateSchema = z
  .object({
    category: z.enum(categoryValues),
    relationship: z.enum(relationshipValues),

    // Location: either a precise coordinate (street) or a broad area.
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    broadArea: z.string().trim().max(120).optional(),
    locationPrecision: z.enum(locationPrecisionValues),

    occurrenceDate: isoDate,
    occurrenceTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    timePrecision: z.enum(timePrecisionValues),

    experience: z.string().trim().min(30).max(2000),

    itemsTaken: z.array(z.enum(itemValues)).optional(),
    itemValueBdt: z.number().int().nonnegative().optional(),
    offenderBand: z.enum(offenderBandValues).optional(),

    weaponReported: z.boolean().optional(),
    weaponType: z.enum(weaponTypeValues).optional(),
    injury: z.enum(injuryValues).optional(),

    context: z.string().trim().max(60).optional(),
    lighting: z.string().trim().max(60).optional(),
    policeReport: z.enum(["yes", "no", "prefer_not_to_say"]).optional(),

    consent: z.literal(true),
  })
  .refine((v) => !isFutureDhakaDate(v.occurrenceDate), {
    message: "Incident date cannot be in the future",
    path: ["occurrenceDate"],
  })
  .refine(
    (v) =>
      v.locationPrecision === "area"
        ? !!v.broadArea
        : v.lat !== undefined && v.lng !== undefined,
    { message: "Provide a map point, or a broad area", path: ["locationPrecision"] },
  );

export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;

// Corrections: the reporter may revise narrative and non-structural detail.
// Category, date and location changes are treated as a new review, not a
// silent edit, so they are excluded here.
export const submissionCorrectionSchema = z.object({
  experience: z.string().trim().min(30).max(2000).optional(),
  itemsTaken: z.array(z.enum(itemValues)).optional(),
  offenderBand: z.enum(offenderBandValues).optional(),
  context: z.string().trim().max(60).optional(),
  lighting: z.string().trim().max(60).optional(),
});
export type SubmissionCorrectionInput = z.infer<
  typeof submissionCorrectionSchema
>;
