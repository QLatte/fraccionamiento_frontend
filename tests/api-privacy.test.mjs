import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const { code } = await transform(await readFile(new URL('../src/api.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'esm', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' },
});
globalThis.window = new EventTarget();
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

for (const status of [401, 403]) test(`H09 clears financial context at ${status} headers before reading a stalled body`, async () => {
  api.setToken(`synthetic-${status}`);
  let bodyRead = false;
  globalThis.fetch = async () => ({ status, ok: false, json: () => { bodyRead = true; return new Promise(() => {}); } });
  await assert.rejects(api.api('/billing/my-payments'), error => error.status === status);
  assert.equal(api.financialState().endsWith(':true'), true);
  assert.equal(bodyRead, false);
});

test('H09 rejects an old session response without exposing its payload', async () => {
  api.setToken('synthetic-old');
  let release;
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  const request = api.api('/billing/my-payments');
  api.setToken('synthetic-new');
  let bodyRead = false;
  release({ status: 200, ok: true, json: async () => { bodyRead = true; return { private: 'old-session' }; } });
  await assert.rejects(request);
  assert.equal(bodyRead, false);
  assert.equal(api.financialState().endsWith(':false'), true);
});
