import { defineConfig } from "@playwright/test";
export default defineConfig({
  workers: 1,
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "node --import tsx tests/e2e/server.ts",
    url: "http://localhost:3000",
    reuseExistingServer: false,
  },
  reporter: "list",
});
