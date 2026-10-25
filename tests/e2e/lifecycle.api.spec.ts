import { test, expect } from "@playwright/test";
import {
  createSubmission,
  createAndPublish,
  loginAs,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.6: approval creates a shareable public page; an edit waits for
// review; withdrawal removes live content.
test("approval publishes; correction returns to review; withdrawal unpublishes", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");
  const c = randomCoord();

  const { id, publicId } = await createAndPublish(request, {
    lat: c.lat,
    lng: c.lng,
    repEmail: rep,
    modEmail: mod,
  });

  // Shareable public page exists, with a server-generated share-card image.
  expect((await request.get(`/api/incidents/${publicId}`)).status()).toBe(200);
  const card = await request.get(`/api/og/incident/${publicId}`);
  expect(card.ok()).toBeTruthy();
  expect(card.headers()["content-type"]).toContain("image/png");

  // A correction is a reviewable revision; the public page is unchanged.
  await loginAs(request, rep, "reporter");
  const patch = await request.patch(`/api/me/submissions/${id}`, {
    data: { experience: "[E2E] a corrected description that is at least thirty characters." },
  });
  expect((await patch.json()).status).toBe("under_review");
  expect((await request.get(`/api/incidents/${publicId}`)).status()).toBe(200);

  // Withdrawal removes the live content.
  await request.patch(`/api/me/submissions/${id}`, { data: { action: "withdraw" } });
  expect((await request.get(`/api/incidents/${publicId}`)).status()).toBe(404);
});

test("duplicate submit with the same idempotency key does not double-create", async ({
  request,
}) => {
  const c = randomCoord();
  await loginAs(request, uniqueEmail("rep"), "reporter");
  const key = `e2e-idem-${Date.now()}`;
  const first = await createSubmission(request, { lat: c.lat, lng: c.lng }, key);
  const second = await createSubmission(request, { lat: c.lat, lng: c.lng }, key);
  expect(first.status()).toBe(201);
  expect((await first.json()).id).toBe((await second.json()).id);
});
