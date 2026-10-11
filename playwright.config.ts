import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5181",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: process.env.MMP_BROWSER
      ? { executablePath: process.env.MMP_BROWSER }
      : undefined,
  },
  webServer: {
    command: "npm run dev -- --port 5181 --strictPort",
    url: "http://127.0.0.1:5181",
    reuseExistingServer: false,
  },
});
