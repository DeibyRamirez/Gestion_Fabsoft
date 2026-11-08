import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { seedUsers } from './seed-users';

const authDir = path.join(process.cwd(), 'e2e/.auth');

const roles = [
  seedUsers.admin,
  seedUsers.operator,
  seedUsers.client,
  seedUsers.clientMustChange,
] as const;

setup.describe.configure({ mode: 'serial' });

setup('prepare auth cache directory', async () => {
  fs.mkdirSync(authDir, { recursive: true });
  for (const f of fs.readdirSync(authDir)) {
    if (f.endsWith('.json')) fs.rmSync(path.join(authDir, f));
  }
});

for (const role of roles) {
  setup(`authenticate ${role.file}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(role.email);
    await page.getByLabel('Contraseña').fill(role.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    if (role.file === 'client-must-change.json') {
      await expect(page).toHaveURL(/\/change-password/, { timeout: 20000 });
    } else {
      await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });
    }
    await page.context().storageState({ path: path.join(authDir, role.file) });
  });
}
