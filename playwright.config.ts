import { defineConfig } from "@playwright/test";

// auth.spec.ts mocks Supabase's /auth/v1 endpoints, so it needs no real accounts or emails.
// workflow.spec.ts needs the throwaway local stack (scripts/local-stack/up.sh) and E2E_LOCAL=1.
// Unit tests (tests/unit/*.test.ts) run with node:test, not Playwright (`npm run test:unit`).
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 90_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
