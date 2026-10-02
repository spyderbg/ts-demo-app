import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3467', viewport: { width: 1440, height: 1000 }, headless: true, timezoneId: 'Europe/Sofia', trace: 'retain-on-failure' },
  webServer: { command: 'npx tsx scripts/test-server.ts', url: 'http://127.0.0.1:3467/api/health', reuseExistingServer: false, timeout: 30000 },
  reporter: 'list',
});
