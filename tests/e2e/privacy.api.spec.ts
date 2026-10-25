import { test, expect } from "@playwright/test";
import {
  createSubmission,
  createAndPublish,
  loginAs,
  randomCoord,
  uniqueEmail,
} from "./helpers";

const PRIVATE_FIELDS = [
  "originalText",
  "experience",
  "contact",
  "contactEncrypted",
  "rawLat",
  "rawLng",
  "ownerId",
];

// Brief §9.5: no endpoint or asset leaks contact, evidence, the original
// narrative or a private coordinate to a visitor, another reporter or a crawler.
test("public incident endpoints expose only safe fields", async ({ request }) => {
  const c = randomCoord();
  const marker = `SECRET-ORIGINAL-${Date.now()}`;
  const { publicId } = await createAndPublish(request, {
    lat: c.lat,
    lng: c.lng,
    experience: `[E2E] ${marker} private original narrative that must never be public, thirty+ chars.`,
    repEmail: uniqueEmail("rep"),
    modEmail: uniqueEmail("mod"),
  });

  const list = await (await request.get("/api/incidents?limit=100")).json();
  const detail = await (await request.get(`/api/incidents/${publicId}`)).json();

  const sample = list.incidents[0];
  for (const f of PRIVATE_FIELDS) {
    expect(Object.keys(sample)).not.toContain(f);
    expect(Object.keys(detail.incident)).not.toContain(f);
  }
  // The private original narrative never appears in public payloads.
  expect(JSON.stringify(list)).not.toContain(marker);
  expect(JSON.stringify(detail)).not.toContain(marker);

  // A social crawler (plain GET of the public page HTML) sees no original text.
  const html = await (await request.get(`/en/incident/${publicId}`)).text();
  expect(html).not.toContain(marker);
});

test("private and staff endpoints reject unauthorized access", async ({
  request,
}) => {
  // Anonymous.
  expect((await request.get("/api/me/submissions")).status()).toBe(401);
  expect((await request.get("/api/admin/queue")).status()).toBe(401);
  expect((await request.get("/api/admin/config")).status()).toBe(401);

  // A plain reporter cannot reach staff/admin endpoints.
  await loginAs(request, uniqueEmail("rep"), "reporter");
  expect((await request.get("/api/admin/queue")).status()).toBe(403);
  expect((await request.get("/api/admin/config")).status()).toBe(403);
  expect((await request.get("/api/admin/exports")).status()).toBe(403);
});

test("a reporter cannot read another reporter's private submission", async ({
  request,
}) => {
  const c = randomCoord();
  const owner = uniqueEmail("owner");
  await loginAs(request, owner, "reporter");
  const cr = await createSubmission(request, { lat: c.lat, lng: c.lng });
  const { id } = await cr.json();

  // Different reporter.
  await loginAs(request, uniqueEmail("other"), "reporter");
  expect((await request.get(`/api/me/submissions/${id}`)).status()).toBe(404);
  // And cannot reach the moderator's private detail view.
  expect((await request.get(`/api/admin/submissions/${id}`)).status()).toBe(403);
});
