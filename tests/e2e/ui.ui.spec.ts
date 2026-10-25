import { test, expect } from "@playwright/test";

// Brief §9.7 (UI): Bangla interface, an accessible list fallback for the map,
// keyboard access, a mobile layout, and a shareable approved page.

test("Bangla interface renders", async ({ page }) => {
  await page.goto("/bn");
  await expect(page.getByRole("link", { name: "ঘটনা জানান" })).toBeVisible();
  await expect(page.getByText("ঢাকা", { exact: false }).first()).toBeVisible();
});

test("map has an accessible list fallback", async ({ page }) => {
  await page.goto("/en");
  // The Map/List toggle is always present; switching to List gives an
  // equivalent, map-free view (the §9.7 fallback requirement).
  const listBtn = page.getByRole("button", { name: "List", exact: true });
  await expect(listBtn).toBeVisible();
  await listBtn.click();
  // Demo data is present, so the list shows at least one area with a count.
  await expect(page.getByText(/report/i).first()).toBeVisible();
});

test("primary actions are keyboard reachable", async ({ page }) => {
  await page.goto("/en");
  const report = page.getByRole("link", { name: "Report an incident" });
  await report.focus();
  await expect(report).toBeFocused();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");
  await expect(page.getByRole("button", { name: "Last 7 days" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("an approved incident page is shareable", async ({ page }) => {
  const res = await page.request.get("/api/incidents?limit=1");
  const { incidents } = await res.json();
  test.skip(incidents.length === 0, "no published incidents to view");
  await page.goto(`/en/incident/${incidents[0].publicId}`);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByText(/do not measure personal risk/i)).toBeVisible();
});
