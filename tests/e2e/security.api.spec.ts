import { test, expect } from "@playwright/test";
import {
  createSubmission,
  createAndPublish,
  loginAs,
  publish,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.8: malicious uploads, stored script injection, unauthorised admin
// access and CSV formula payloads.
test("evidence upload rejects disallowed type and oversize", async ({
  request,
}) => {
  const c = randomCoord();
  await loginAs(request, uniqueEmail("rep"), "reporter");
  const { id } = await (await createSubmission(request, { lat: c.lat, lng: c.lng })).json();

  const badType = await request.post("/api/evidence", {
    data: { submissionId: id, fileType: "application/x-msdownload", size: 1000 },
  });
  expect(badType.status()).toBe(422);

  const oversize = await request.post("/api/evidence", {
    data: { submissionId: id, fileType: "image/png", size: 6 * 1024 * 1024 },
  });
  expect(oversize.status()).toBe(422);
});

test("stored script in a narrative is escaped on the public page", async ({
  request,
}) => {
  const c = randomCoord();
  const marker = `xss${Date.now()}`;
  await loginAs(request, uniqueEmail("rep"), "reporter");
  const { id } = await (await createSubmission(request, { lat: c.lat, lng: c.lng })).json();
  await loginAs(request, uniqueEmail("mod"), "moderator");
  const pr = await publish(
    request,
    id,
    `[E2E] <script>window.${marker}=1</script> redacted narrative text here.`,
  );
  const { publicId } = await pr.json();

  const html = await (await request.get(`/en/incident/${publicId}`)).text();
  // The raw executable tag must not be present; React escapes it.
  expect(html).not.toContain(`<script>window.${marker}`);
  expect(html).toContain(`&lt;script&gt;window.${marker}`);
});

test("CSV export neutralises spreadsheet formula payloads", async ({ request }) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  // A street incident whose broad-area label carries a formula payload (so it
  // lands in a grid cell row of the export).
  const c = randomCoord();
  await loginAs(request, rep, "reporter");
  const cr = await createSubmission(request, {
    lat: c.lat,
    lng: c.lng,
    broadArea: '=HYPERLINK("http://evil","x")',
  });
  const { id } = await cr.json();
  await loginAs(request, mod, "moderator");
  expect((await publish(request, id)).ok()).toBeTruthy();

  await loginAs(request, uniqueEmail("admin"), "admin");
  const exp = await request.get("/api/admin/exports?window=7");
  expect(exp.ok()).toBeTruthy();
  expect(exp.headers()["content-type"]).toContain("text/csv");
  const csv = await exp.text();
  // The formula must never appear with a leading '=' (it is prefixed with ').
  expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  expect(csv).toContain("'=HYPERLINK");
});

test("failed OTP confirm is rejected", async ({ request }) => {
  const r = await request.post("/api/verify/confirm", {
    data: { contact: uniqueEmail("x"), contactType: "email", code: "000000" },
  });
  expect(r.ok()).toBeFalsy();
  expect(r.status()).toBe(400);
});
