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

for (const code of [401, 403]) test(`H09 ${code} removes CLABE, balances and an open receipt`, async ({ page }) => {
  await page.clock.install();
  let revoked = false;
  await page.route('https://payments.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (revoked) return route.fulfill({ status: code, json: { error: { code: 'REVOKED', message: 'Revocado' } } });
    if (path.endsWith('/receipt')) return route.fulfill({ json: { folio: 'private-receipt', amountCents: '123450', retainedCents: '123450', date: '2026-10-20T12:00:00Z', method: 'SPEI', notice: 'No es CFDI', sandbox: true } });
    if (path.endsWith('/my-statement')) return route.fulfill({ json: { balanceCents: '123450' } });
    return route.fulfill({ json: { accountId: 'account', communityId: 'community', destination: true, instructions: { clabe: '646180000000000001', bank: 'Private bank', beneficiary: 'Private beneficiary' }, payments: [{ id: 'payment', amountCents: '123450', method: 'SPEI' }], tasks: [] } });
  });
  await page.goto('https://payments.test/');
  await page.getByRole('button', { name: 'Ver recibo' }).click();
  await expect(page.getByText('Folio: private-receipt')).toBeVisible();
  revoked = true; await page.clock.fastForward(16000);
  await expect(page.getByText(/información financiera se retiró/)).toBeVisible();
  await expect(page.getByText('646180000000000001')).toHaveCount(0); await expect(page.getByText('Folio: private-receipt')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
test('H09 discards a late receipt across rapid home changes and hides financial data offline/logout/back/reload', async ({ page, context }) => {
  let releaseReceipt!: () => void;
  const waiting = new Promise<void>(resolve => { releaseReceipt = resolve; });
  let receiptStarted = false;
  await page.route('https://payments.test/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (path.endsWith('/receipt')) { receiptStarted = true; await waiting; return route.fulfill({ json: { folio: 'old-private-receipt', amountCents: '1000', retainedCents: '1000', date: null, method: 'SPEI', notice: 'No CFDI', sandbox: true } }); }
    if (path.endsWith('/my-statement')) return route.fulfill({ json: { balanceCents: '1000' } });
    const old = url.searchParams.get('propertyId') !== 'other';
    return route.fulfill({ json: { accountId: old ? 'old' : 'new', communityId: 'community', destination: true, instructions: { clabe: old ? '646180000000000001' : '646180000000000002', bank: 'Synthetic', beneficiary: 'Synthetic' }, payments: old ? [{ id: 'payment', amountCents: '1000', method: 'SPEI' }] : [], tasks: [] } });
  });
  await page.goto('https://payments.test/');
  await page.getByRole('button', { name: 'Ver recibo' }).click(); await expect.poll(() => receiptStarted).toBe(true);
  await page.getByRole('button', { name: 'Cambiar vivienda de prueba' }).click();
  await expect(page.getByText('646180000000000002')).toBeVisible(); releaseReceipt();
  await expect(page.getByText('Folio: old-private-receipt')).toHaveCount(0);
  await context.setOffline(true); await expect(page.getByText(/información financiera se retiró/)).toBeVisible();
  await expect(page.getByText('646180000000000002')).toHaveCount(0);
  await context.setOffline(false); await expect(page.getByText('646180000000000002')).toBeVisible();
  await page.getByRole('button', { name: 'Salir de prueba' }).click(); await expect(page.getByText('646180000000000002')).toHaveCount(0);
  await page.goto('about:blank'); await page.goBack();
  // Fresh response is permitted; prior receipt and persisted financial state are not.
  await expect(page.getByText('Folio: old-private-receipt')).toHaveCount(0);
  await page.reload(); expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
test('H09 session change discards an in-flight receipt even when the route remains identical', async ({ page }) => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); let started = false;
  await page.route('https://payments.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (path.endsWith('/receipt')) { started = true; await wait; return route.fulfill({ json: { folio: 'previous-session', amountCents: '1000', retainedCents: '1000', date: null, method: 'CASH', notice: 'No CFDI' } }); }
    if (path.endsWith('/my-statement')) return route.fulfill({ json: { balanceCents: '0' } });
    return route.fulfill({ json: { accountId: 'account', communityId: 'community', destination: false, instructions: null, payments: [{ id: 'p', amountCents: '1000', method: 'CASH' }], tasks: [] } });
  });
  await page.goto('https://payments.test/'); await page.getByRole('button', { name: 'Ver recibo' }).click(); await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Cambiar sesión de prueba' }).click(); release();
  await expect(page.getByText('Folio: previous-session')).toHaveCount(0);
});
test('pending review explains why Stripe refused, also for records saved before the reason existed', async ({ page }) => {
  await page.route('https://payments.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/admin') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/test.js"></script>' });
    if (path === '/test.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    return route.fulfill({ json: { destination: { stripeAccount: 'acct_test', reconciledAt: null }, payments: [], events: [], tasks: [
      { id: 't1', kind: 'CHECKOUT', status: 'REVIEW', errorCode: 'STRIPE_REQUEST_FAILED:400:resource_missing:customer', createdAt: '2026-11-09T18:00:00Z' },
      { id: 't2', kind: 'CHECKOUT', status: 'REVIEW', errorCode: 'STRIPE_REQUEST_FAILED', createdAt: '2026-11-09T17:00:00Z' },
      { id: 't3', kind: 'CHECKOUT', status: 'PENDING', errorCode: 'STRIPE_REQUEST_FAILED:500:api_error:', createdAt: '2026-11-09T16:00:00Z' },
    ] } });
  });
  await page.goto('https://payments.test/admin');
  await expect(page.getByText(/Stripe no encuentra el cliente de esta casa/)).toBeVisible();
  await expect(page.getByText('Reintentar fallará igual hasta corregir la causa.')).toHaveCount(1);
  await expect(page.getByText(/anterior a que se guardara el motivo/)).toBeVisible();
  await expect(page.getByText(/falla temporal. Se reintentará sola/)).toBeVisible();
  await expect(page.getByText(/Pago con tarjeta · Requiere revisión/).first()).toBeVisible();
});
