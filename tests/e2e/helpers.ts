import { APIRequestContext, expect } from "@playwright/test";
import { latLngToCell } from "h3-js";

export const H3_RES = 9;

// A random coordinate inside the Dhaka launch bbox. Each test uses a fresh,
// effectively-empty cell so absolute count/band assertions hold on re-runs.
export function randomCoord(): { lat: number; lng: number } {
  return {
    lat: 23.68 + Math.random() * 0.26,
    lng: 90.33 + Math.random() * 0.18,
  };
}

export function cellFor(lat: number, lng: number): string {
  return latLngToCell(lat, lng, H3_RES);
}

// A date (YYYY-MM-DD) offset from today in Dhaka (UTC+6).
export function dhakaDate(offsetDays = 0): string {
  const ms = Date.now() + 6 * 3600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

let seq = 0;
export function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.local`;
}

export async function loginAs(
  ctx: APIRequestContext,
  email: string,
  role: "reporter" | "moderator" | "admin",
): Promise<void> {
  const r = await ctx.post("/api/test/login", { data: { email, role } });
  expect(r.ok(), `login as ${role}`).toBeTruthy();
}

type SubmissionOpts = {
  lat?: number;
  lng?: number;
  broadArea?: string;
  date?: string;
  time?: string;
  category?: string;
  experience?: string;
};

// Create a submission as the currently signed-in reporter. Returns the raw
// response so callers can assert status.
export function createSubmission(
  ctx: APIRequestContext,
  opts: SubmissionOpts,
  idempotencyKey?: string,
) {
  const street = opts.lat !== undefined && opts.lng !== undefined;
  const body: Record<string, unknown> = {
    category: opts.category ?? "snatching",
    relationship: "victim",
    locationPrecision: street ? "street" : "area",
    occurrenceDate: opts.date ?? dhakaDate(0),
    timePrecision: opts.time ? "exact" : "unknown",
    experience:
      opts.experience ??
      "[E2E] a test incident description that is at least thirty characters long.",
    consent: true,
  };
  if (street) {
    body.lat = opts.lat;
    body.lng = opts.lng;
    if (opts.broadArea !== undefined) body.broadArea = opts.broadArea;
  } else {
    body.broadArea = opts.broadArea ?? "Test area";
  }
  if (opts.time) body.occurrenceTime = opts.time;

  return ctx.post("/api/submissions", {
    data: body,
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
  });
}

export async function publish(
  ctx: APIRequestContext,
  submissionId: string,
  narrative = "[E2E] redacted public narrative for testing.",
) {
  return ctx.post(`/api/admin/reviews/${submissionId}/action`, {
    data: { action: "publish", redactedNarrative: narrative },
  });
}

// Full path: reporter creates, moderator publishes. Returns ids + the cell.
export async function createAndPublish(
  ctx: APIRequestContext,
  opts: SubmissionOpts & { repEmail: string; modEmail: string },
) {
  await loginAs(ctx, opts.repEmail, "reporter");
  const cr = await createSubmission(ctx, opts);
  expect(cr.status(), "submission created").toBe(201);
  const { id } = await cr.json();
  await loginAs(ctx, opts.modEmail, "moderator");
  const pr = await publish(ctx, id);
  expect(pr.ok(), "publish").toBeTruthy();
  const { publicId } = await pr.json();
  return { id, publicId };
}

export async function hotspots(ctx: APIRequestContext) {
  return (await ctx.get("/api/hotspots")).json();
}

export function cellCount(hs: { cells: { cellId: string; count: number }[] }, cell: string) {
  return hs.cells.find((c) => c.cellId === cell)?.count ?? 0;
}

export function cellBand(
  hs: { cells: { cellId: string; band?: string }[] },
  cell: string,
) {
  return hs.cells.find((c) => c.cellId === cell)?.band ?? "grey";
}
