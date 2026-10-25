import { test, expect } from "@playwright/test";
import {
  createSubmission,
  createAndPublish,
  loginAs,
  publish,
  hotspots,
  cellCount,
  cellFor,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.4: non-public states never enter counts; broad-area reports are
// excluded from the grid and disclosed.
test("pending and rejected submissions never enter public counts", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  // Pending (submitted, never published).
  const p = randomCoord();
  await loginAs(request, rep, "reporter");
  const pc = await createSubmission(request, { lat: p.lat, lng: p.lng });
  expect(pc.status()).toBe(201);
  expect(cellCount(await hotspots(request), cellFor(p.lat, p.lng))).toBe(0);

  // Rejected.
  const r = randomCoord();
  await loginAs(request, rep, "reporter");
  const rc = await createSubmission(request, { lat: r.lat, lng: r.lng });
  const { id } = await rc.json();
  await loginAs(request, mod, "moderator");
  const rej = await request.post(`/api/admin/reviews/${id}/action`, {
    data: { action: "reject", reason: "e2e test rejection" },
  });
  expect(rej.ok()).toBeTruthy();
  expect(cellCount(await hotspots(request), cellFor(r.lat, r.lng))).toBe(0);
});

test("withdrawn incidents leave public counts and the detail page", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");
  const c = randomCoord();
  const cell = cellFor(c.lat, c.lng);
  const { id, publicId } = await createAndPublish(request, {
    lat: c.lat,
    lng: c.lng,
    repEmail: rep,
    modEmail: mod,
  });
  expect(cellCount(await hotspots(request), cell)).toBe(1);

  await loginAs(request, rep, "reporter");
  await request.patch(`/api/me/submissions/${id}`, {
    data: { action: "withdraw" },
  });
  expect(cellCount(await hotspots(request), cell)).toBe(0);
  expect((await request.get(`/api/incidents/${publicId}`)).status()).toBe(404);
});

test("broad-area report is excluded from the grid, counted and disclosed", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  const before = (await hotspots(request)).excludedBroadArea;

  await loginAs(request, rep, "reporter");
  const cr = await createSubmission(request, { broadArea: "Somewhere in Dhaka" });
  expect(cr.status()).toBe(201);
  const { id } = await cr.json();
  await loginAs(request, mod, "moderator");
  const pr = await publish(request, id);
  const { publicId } = await pr.json();

  // In the public list, but not in any grid cell; excluded count disclosed.
  const list = await (
    await request.get("/api/incidents?limit=100")
  ).json();
  expect(list.incidents.some((i: { publicId: string }) => i.publicId === publicId)).toBeTruthy();

  const hs = await hotspots(request);
  expect(hs.excludedBroadArea).toBeGreaterThanOrEqual(before + 1);
});
