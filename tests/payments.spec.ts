import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
let js = '', css = '';
test.beforeAll(async () => {
  const result = await build({ entryPoints: [resolve('tests/payments-ui.tsx')], bundle: true, write: false, outdir: '/tmp/zentry-payments-ui', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"production"' } });
  js = result.outputFiles.find(f => f.path.endsWith('.js'))!.text; css = result.outputFiles.find(f => f.path.endsWith('.css'))!.text;
});
for (const width of [390, 1440]) test(`resident sandbox checkout at ${width}px uses exact cents, never credits from the return URL`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const posts: { body: Record<string, unknown>; key?: string }[] = [];
  await page.route('https://payments.test/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script></html>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (path === '/test.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (req.method() === 'POST') { posts.push({ body: req.postDataJSON(), key: req.headers()['idempotency-key'] }); return route.fulfill({ json: { taskId: 'task' } }); }
    if (path.endsWith('/my-statement')) return route.fulfill({ json: { balanceCents: '123450' } });
    return route.fulfill({ json: { accountId: 'account', communityId: 'community', destination: true, instructions: { clabe: '646180000000000001', bank: 'Banco de prueba', beneficiary: 'Fraccionamiento de prueba' }, payments: [], tasks: posts.length ? [{ id: 'task', kind: 'CHECKOUT', status: 'DONE', result: { url: 'https://checkout.stripe.com/c/pay/cs_test_123' } }] : [] } });
  });
  await page.goto('https://payments.test/?resultado=regreso');
  await expect(page.getByText('Saldo: $1,234.50 MXN')).toBeVisible();
  await page.getByLabel('Importe a pagar en MXN').fill('200.01');
  await page.getByRole('button', { name: 'Preparar pago seguro' }).click();
  await expect(page.getByRole('link', { name: 'Continuar en Stripe' })).toHaveAttribute('href', 'https://checkout.stripe.com/c/pay/cs_test_123');
  expect(posts[0].body.amountCents).toBe('20001'); expect(posts[0].key).toBeTruthy();
  await expect(page.getByText('Saldo: $1,234.50 MXN')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recibo de pago' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('manual transfer records a reference and explicit operator note', async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route('https://payments.test/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/admin') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (req.method() === 'POST') { body = req.postDataJSON(); return route.fulfill({ json: { id: 'payment' } }); }
    return route.fulfill({ json: { destination: null, payments: [], tasks: [], events: [] } });
  });
  await page.goto('https://payments.test/admin');
  await page.getByLabel('Medio', { exact: true }).selectOption('TRANSFER');
  await page.getByLabel('Importe en MXN', { exact: true }).fill('1200.50');
  await page.getByLabel('Folio único de caja o transferencia').fill('TRANSFER-001');
  await page.getByLabel('Nota', { exact: true }).fill('Transferencia verificada en banco');
  await page.getByRole('button', { name: 'Confirmar pago recibido' }).click();
  await expect.poll(() => body).toMatchObject({ amountCents: '120050', method: 'TRANSFER', reference: 'TRANSFER-001', reason: 'Transferencia verificada en banco' });
});
