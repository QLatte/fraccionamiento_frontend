import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 120000, expect: { timeout: 15000 }, workers: 1, fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]], outputDir: 'test-results/artifacts',
  use: { actionTimeout: 15000, baseURL: 'http://localhost:5188', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + resolve('test-results/camera.y4m')], ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}) }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: '../sica-qr-backend/node_modules/.bin/tsx scripts/e2e-server.mts', url: 'http://localhost:5188/api/v1/ready', reuseExistingServer: false, timeout: 60000 },
});
