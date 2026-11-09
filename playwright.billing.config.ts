import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['billing.spec.ts', 'payments.spec.ts'], workers: 1,
  outputDir: 'test-results/billing', reporter: 'list',
  use: { launchOptions: { ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}) }, screenshot: 'only-on-failure' },
});
