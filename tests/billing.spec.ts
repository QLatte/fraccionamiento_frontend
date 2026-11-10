import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
let js = '', css = '';
test.beforeAll(async () => {
  const result = await build({ entryPoints: [resolve('tests/billing-ui.tsx')], bundle: true, write: false, outdir: '/tmp/zentry-billing-ui', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"production"' } });
  js = result.outputFiles.find(f => f.path.endsWith('.js'))!.text;
  css = result.outputFiles.find(f => f.path.endsWith('.css'))!.text;
});
for (const width of [390, 1440]) test(`monthly ledger, retry and reversal at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  let reversed = false; const posts: { path: string; body: Record<string, unknown>; key: string | undefined }[] = [];
  const accountId = '00000000-0000-4000-8000-000000000001';
  await page.route('https://billing.test/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script></html>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (path === '/test.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (req.method() === 'POST') { posts.push({ path, body: req.postDataJSON(), key: req.headers()['idempotency-key'] }); if (path.endsWith('/reverse')) reversed = true; return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith('/availability')) return route.fulfill({ json: { enabled: true, canManage: true, canConfigure: false } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, emissionEnabled: false, startMonth: '2026-10' } });
    if (path.endsWith('/overview')) return route.fulfill({ json: { currentMonth: '2026-10', concepts: [], fees: [], accounts: [{ id: accountId, propertyId: 'home', payerId: null, balanceCents: reversed ? '0' : '123450', overdueCents: '0', property: { street: 'Privada de prueba', houseNumber: '12', memberships: [] } }] } });
    if (path.endsWith('/statement')) return route.fulfill({ json: { balanceCents: reversed ? '0' : '123450', overdueCents: '0', movements: [{ id: 'charge', kind: 'CHARGE', description: 'Mantenimiento', amountCents: '123450', effectiveAt: '2026-10-01T06:00:00Z', dueAt: '2026-10-21T06:00:00Z', period: '2026-10', reversesId: null, reason: 'Emisión mensual' }, ...(reversed ? [{ id: 'reversal', kind: 'REVERSAL', description: 'Reverso: Mantenimiento', amountCents: '-123450', effectiveAt: '2026-10-22T06:00:00Z', reversesId: 'charge', reason: 'Cargo incorrecto' }] : [])] } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('https://billing.test/');
  await page.getByRole('tab', { name: 'Configuración' }).click();
  await expect(page.getByText('Emisión pausada.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo concepto' }).click();
  await page.getByLabel('Cuota base en MXN').fill('1234.50');
  await page.getByLabel('Motivo del cambio').fill('Cuota mensual aprobada');
  await page.getByRole('button', { name: 'Guardar concepto' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body.baseCents).toBe('123450'); expect(posts[0].key).toBeTruthy();
  await page.getByRole('tab', { name: 'Viviendas' }).click();
  await page.getByRole('button', { name: /Casa 12 · Privada de prueba/ }).click();
  await expect(page.getByText('$1,234.50 MXN').first()).toBeVisible();
  await page.getByRole('button', { name: 'Corregir con reverso' }).click();
  await page.getByRole('textbox', { name: /^Motivo/ }).fill('Cargo incorrecto');
  await page.getByRole('button', { name: 'Confirmar reverso' }).click();
  await expect(page.getByText('anulado con reverso', { exact: false })).toBeVisible();
  expect(posts[1].body).toMatchObject({ reason: 'Cargo incorrecto' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/billing-${width}.png`, fullPage: true });
});
test('disabled billing exposes no financial forms', async ({ page }) => {
  await page.route('https://billing.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    return route.fulfill({ json: { enabled: false, canManage: false, canConfigure: false } });
  });
  await page.goto('https://billing.test/');
  await expect(page.getByText('La cobranza no está habilitada o no tienes permiso financiero.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar concepto' })).toHaveCount(0);
});
