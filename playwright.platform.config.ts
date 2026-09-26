import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: 'platform.spec.ts', workers: 1, use: { baseURL: 'http://localhost:5190', headless: true, channel: 'chrome' }, webServer: { command: 'npm run dev -- --port 5190', url: 'http://localhost:5190', reuseExistingServer: false } });
