import { request } from "@playwright/test";

// Raise rate limits so the acceptance suite is not throttled, using the
// test-auth admin shortcut. Persists in the global configuration row.
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: "http://localhost:3000" });
  const login = await ctx.post("/api/test/login", {
    data: { email: "e2e-setup-admin@test.local", role: "admin" },
  });
  if (!login.ok()) {
    throw new Error(
      `test-auth login failed (${login.status()}). Is ENABLE_TEST_AUTH=1 set?`,
    );
  }
  await ctx.patch("/api/admin/config", {
    data: {
      rateLimits: {
        ipPerMinute: 1_000_000,
        submissionsPerContactPerDay: 1_000_000,
        otpPerContactPerHour: 1_000_000,
      },
    },
  });
  await ctx.dispose();
}
