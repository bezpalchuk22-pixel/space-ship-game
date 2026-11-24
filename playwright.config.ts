import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    timeout: 60_000,
    expect: {
        timeout: 10_000
    },
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:3101",
        ...devices["Desktop Chrome"],
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ],
    webServer: {
        command: "npm run build && npm run build:server && npm start",

        url: "http://127.0.0.1:3101/health",
        env: {
            PORT: "3101",
            LOG_DIR: "./logs/e2e",
            ALLOWED_ORIGINS: "http://127.0.0.1:3101"
        },
        timeout: 120_000,
        reuseExistingServer: false
    }
});
