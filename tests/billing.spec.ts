import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
let js = '', css = '';
test.beforeAll(async () => {
  const result = await build({ entryPoints: [resolve('tests/billing-ui.tsx')], bundle: true, write: false, outdir: '/tmp/zentry-billing-ui', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"production"' } });
  js = result.outputFiles.find(f => f.path.endsWith('.js'))!.text;
  css = result.outputFiles.find(f => f.path.endsWith('.css'))!.text;
});
for (const width of [390, 1440]) test(`concepts, debt by privada and titulares at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const posts: { path: string; body: Record<string, unknown>; key: string | undefined }[] = [];
  const accountId = '00000000-0000-4000-8000-000000000001';
  await page.route('https://billing.test/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script></html>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (path === '/test.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (req.method() === 'POST') { posts.push({ path, body: req.postDataJSON(), key: req.headers()['idempotency-key'] }); return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith('/availability')) return route.fulfill({ json: { enabled: true, canManage: true, canConfigure: false } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, emissionEnabled: false, startMonth: '2026-10' } });
    if (path.endsWith('/overview')) return route.fulfill({ json: { currentMonth: '2026-10', concepts: [], fees: [], privadaModel: false,
      accounts: [{ id: accountId, propertyId: 'home', payerId: null, property: { street: 'Robles', houseNumber: '12', cluster: { id: 'k1', name: 'Robles', type: 'PRIVADA' }, memberships: [{ userId: '00000000-0000-4000-8000-0000000000aa', user: { fullName: 'Ana García' } }] } }],
      privadas: [{ clusterId: 'k1', name: 'Robles', type: 'PRIVADA', homes: 1, billing: 'HOMES', owedCents: '123450', overdueCents: '0', creditCents: '0', pendingCents: '0', previousCents: '0', currentDue: null, withoutPayer: 1 }] } });
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
  // Tesorería shows what each privada owes, never a home's balance.
  await page.getByRole('tab', { name: 'Privadas' }).click();
  const card = page.getByRole('article', { name: 'Privada Robles' });
  await expect(card.getByText('$1,234.50 MXN')).toBeVisible();
  await page.getByRole('button', { name: /Titulares de las casas/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Casa 12')).toBeVisible();
  await expect(dialog.getByText('$1,234.50 MXN')).toHaveCount(0);
  await dialog.getByLabel('Titular de la casa 12').selectOption({ label: 'Ana García' });
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].path).toContain(`/accounts/${accountId}/payer`);
  expect(posts[1].body).toMatchObject({ payerId: '00000000-0000-4000-8000-0000000000aa' });
  await page.keyboard.press('Escape');
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
