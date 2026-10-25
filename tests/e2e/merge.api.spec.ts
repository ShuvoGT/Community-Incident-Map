import { test, expect } from "@playwright/test";
import {
  createSubmission,
  loginAs,
  publish,
  hotspots,
  cellCount,
  cellFor,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.2: five submissions describing one event count once after merging;
// unmerge restores distinct counts. (Totals are server-side per cell, so map
// zoom cannot change them.)
test("merge counts one event once; unmerge restores distinct counts", async ({
  request,
}) => {
  const { lat, lng } = randomCoord();
  const cell = cellFor(lat, lng);
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  // Five submissions in one cell (same event, five witnesses).
  const subIds: string[] = [];
  await loginAs(request, rep, "reporter");
  for (let i = 0; i < 5; i++) {
    const cr = await createSubmission(request, { lat, lng });
    expect(cr.status()).toBe(201);
    subIds.push((await cr.json()).id);
  }

  // Publish the first as the canonical incident.
  await loginAs(request, mod, "moderator");
  const pr = await publish(request, subIds[0]);
  const { incidentId } = await pr.json();
  expect(cellCount(await hotspots(request), cell)).toBe(1);

  // Merge the other four into it: still one event.
  const mr = await request.post("/api/admin/merge", {
    data: { incidentId, submissionIds: subIds.slice(1) },
  });
  expect(mr.ok()).toBeTruthy();
  expect((await mr.json()).merged).toBe(4);
  expect(cellCount(await hotspots(request), cell)).toBe(1);

  // Unmerge one and publish it on its own -> two distinct events.
  const ur = await request.post("/api/admin/merge", {
    data: { submissionId: subIds[1] },
  });
  expect(ur.ok()).toBeTruthy();
  expect((await publish(request, subIds[1])).ok()).toBeTruthy();
  expect(cellCount(await hotspots(request), cell)).toBe(2);
});
