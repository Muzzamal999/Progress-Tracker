import { defineConfig } from "@playwright/test";

// Auth-flow tests mock Supabase's /auth/v1 endpoints, so they need no real accounts or emails.
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
