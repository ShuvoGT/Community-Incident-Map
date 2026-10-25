import { defineConfig, devices } from "@playwright/test";

// Acceptance suite for the brief's section 9 launch gate. Runs against a dev
// server with the test-auth shortcut enabled (ENABLE_TEST_AUTH=1). Requires
// the database to be up (docker compose up -d db).
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  workers: 2,
  retries: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  projects: [
    { name: "api", testMatch: /.*\.api\.spec\.ts/ },
    {
      name: "ui",
      testMatch: /.*\.ui\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/hotspots",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ENABLE_TEST_AUTH: "1" },
  },
});
