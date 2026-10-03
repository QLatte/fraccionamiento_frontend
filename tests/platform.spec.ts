import { test, expect } from '@playwright/test';
for (const width of [1440, 390]) test(`platform assignment and revocation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let assigned = false;
  const user = { id: 'owner-1', fullName: 'Propietario de prueba', email: 'owner@test.invalid', globalRole: 'RESIDENT' };
  const access = { status: 'ACTIVE', devices: 1, invitedAt: null, expiresAt: null, error: null };
  await page.route('**/api/v1/platform/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') { expect(route.request().postDataJSON()).toEqual({ userId: user.id, communityId: 'community-1' }); assigned = true; return route.fulfill({ status: 201, json: {} }); }
    if (route.request().method() === 'DELETE') { assigned = false; return route.fulfill({ status: 204 }); }
    return route.fulfill({ json: path.endsWith('/usage')
      ? { emailEnabled: true, data: [{ id: 'community-1', name: 'Comunidad de prueba', mapsUrl: null, privadas: 1, lotes: 0, activeProperties: 1, activeResidents: 1, extraResidents: 0, admins: assigned ? 1 : 0 }] }
      : { id: 'community-1', name: 'Comunidad de prueba', mapsUrl: null, admins: assigned ? [{ user, createdAt: new Date().toISOString() }] : [], clusters: [{ id: 'cluster-1', name: 'Privada Roble', type: 'PRIVADA', properties: [{ id: 'home-1', street: 'Privada Roble', houseNumber: '42', status: 'ACTIVE', deviceLimit: 2, memberships: [{ membershipRole: 'RESIDENT_OWNER', user, access }] }] }] } });
  });
  await page.goto('/tests/platform-ui.html');
  await expect(page.getByRole('heading', { name: 'Plataforma', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Administrar', exact: true }).click();
  await page.getByLabel('Asignar propietario como administrador').selectOption(user.id);
  await page.getByRole('button', { name: 'Asignar administrador', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revocar administración' })).toBeVisible();
  await page.screenshot({ path: `/tmp/sica-platform-${width}.png`, fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Revocar administración' }).click();
  await expect(page.getByText('Administración revocada. Su acceso residente se conserva.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revocar administración' })).toHaveCount(0);
});
