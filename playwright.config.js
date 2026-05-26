const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  webServer: {
    command: "node server.js",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: {
      PTV_API_KEY: process.env.PTV_API_KEY || "test-key",
      LOG_LEVEL: "silent",
    },
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  testDir: "./tests/e2e",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
