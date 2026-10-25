import { test, expect } from "@playwright/test";
import {
  createSubmission,
  loginAs,
  publish,
  hotspots,
  cellBand,
  cellCount,
  cellFor,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.1: counts 0,1,4,5,9,10 produce exactly the defined weekly bands;
// removing an incident from a count of 10 changes the band after refresh.
test("weekly band thresholds and recompute on removal", async ({ request }) => {
  const { lat, lng } = randomCoord();
  const cell = cellFor(lat, lng);
  const mod = uniqueEmail("mod");
  const rep = uniqueEmail("rep");

  // 0 reports -> cell absent (grey).
  let hs = await hotspots(request);
  expect(cellCount(hs, cell)).toBe(0);
  expect(cellBand(hs, cell)).toBe("grey");

  const ids: string[] = [];
  const addOne = async () => {
    await loginAs(request, rep, "reporter");
    const cr = await createSubmission(request, { lat, lng });
    expect(cr.status()).toBe(201);
    const { id } = await cr.json();
    await loginAs(request, mod, "moderator");
    expect((await publish(request, id)).ok()).toBeTruthy();
    ids.push(id);
  };
  const addN = async (n: number) => {
    for (let i = 0; i < n; i++) await addOne();
  };

  const expectBand = async (count: number, band: string) => {
    const h = await hotspots(request);
    expect(cellCount(h, cell), `count at ${count}`).toBe(count);
    expect(cellBand(h, cell), `band at ${count}`).toBe(band);
  };

  await addN(1);
  await expectBand(1, "yellow");
  await addN(3);
  await expectBand(4, "yellow");
  await addN(1);
  await expectBand(5, "amber");
  await addN(4);
  await expectBand(9, "amber");
  await addN(1);
  await expectBand(10, "red");

  // Remove one from 10 -> 9 -> amber after the inline aggregate refresh.
  await loginAs(request, rep, "reporter");
  const w = await request.patch(`/api/me/submissions/${ids[0]}`, {
    data: { action: "withdraw" },
  });
  expect(w.ok()).toBeTruthy();
  await expectBand(9, "amber");
});
