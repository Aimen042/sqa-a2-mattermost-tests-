import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, RUN_NAME } from './utils/env';

/**
 * Every run writes to reports/<RUN_NAME>/ so smoke, full and regression results
 * are kept side by side as original execution reports (required in the ZIP).
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // deterministic order; NFR-01 creates its own concurrency internally
  retries: 0, // no retries: a failure must be visible, not hidden
  outputDir: `reports/${RUN_NAME}/artifacts`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `reports/${RUN_NAME}/html`, open: 'never' }],
    ['json', { outputFile: `reports/${RUN_NAME}/results.json` }],
    ['junit', { outputFile: `reports/${RUN_NAME}/junit.xml` }],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1366, height: 768 },
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
});
