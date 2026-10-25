import { test, expect } from "@playwright/test";
import {
  createSubmission,
  createAndPublish,
  loginAs,
  hotspots,
  cellCount,
  cellFor,
  dhakaDate,
  randomCoord,
  uniqueEmail,
} from "./helpers";

// Brief §9.3: occurrence-date handling and the seven-day boundary.
test("occurrence date drives the window; future dates rejected", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  // A report filed today about an older (but in-window) event appears.
  const a = randomCoord();
  const cellA = cellFor(a.lat, a.lng);
  await createAndPublish(request, {
    lat: a.lat,
    lng: a.lng,
    date: dhakaDate(-3),
    repEmail: rep,
    modEmail: mod,
  });
  expect(cellCount(await hotspots(request), cellA)).toBe(1);

  // Future incident date is rejected by validation.
  await loginAs(request, rep, "reporter");
  const future = await createSubmission(request, {
    lat: a.lat,
    lng: a.lng,
    date: dhakaDate(2),
  });
  expect(future.ok()).toBeFalsy();
  expect([400, 422]).toContain(future.status());
});

test("seven-day boundary: day-6 included, day-7 excluded from the weekly grid", async ({
  request,
}) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");

  const inside = randomCoord();
  const outside = randomCoord();
  const cellIn = cellFor(inside.lat, inside.lng);
  const cellOut = cellFor(outside.lat, outside.lng);

  await createAndPublish(request, {
    lat: inside.lat,
    lng: inside.lng,
    date: dhakaDate(-6),
    repEmail: rep,
    modEmail: mod,
  });
  await createAndPublish(request, {
    lat: outside.lat,
    lng: outside.lng,
    date: dhakaDate(-7),
    repEmail: rep,
    modEmail: mod,
  });

  const weekly = await hotspots(request);
  expect(cellCount(weekly, cellIn)).toBe(1);
  expect(cellCount(weekly, cellOut)).toBe(0);

  // The day-7 event still shows in the 30-day layer.
  const monthly = await (await request.get("/api/hotspots?window=30")).json();
  expect(cellCount(monthly, cellOut)).toBe(1);
});

test("date-only report has an unknown time band", async ({ request }) => {
  const rep = uniqueEmail("rep");
  const mod = uniqueEmail("mod");
  const c = randomCoord();
  const { publicId } = await createAndPublish(request, {
    lat: c.lat,
    lng: c.lng,
    date: dhakaDate(-1),
    repEmail: rep,
    modEmail: mod,
  }); // no time provided
  const inc = await (await request.get(`/api/incidents/${publicId}`)).json();
  expect(inc.incident.timeBand).toBe("unknown");
});
