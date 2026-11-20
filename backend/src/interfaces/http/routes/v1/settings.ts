import { SettingsSchema } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import type { GetSettings } from '../../../../application/settings/get-settings/use-case.js';
import type { UpdateSettings } from '../../../../application/settings/update-settings/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface SettingsRouteDeps {
  getSettings: GetSettings;
  updateSettings: UpdateSettings;
}

export function settingsRouter(deps: SettingsRouteDeps, guards: RequestHandler[]): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];
  const admin = [...guards, requireRole('admin')];

  router.get('/settings', ...staff, async (_req, res) => {
    res.json(await deps.getSettings.execute(actorOf(res)));
  });

  router.patch('/settings', ...admin, async (req, res) => {
    const input = SettingsSchema.parse(req.body);
    res.json(await deps.updateSettings.execute(actorOf(res), input));
  });

  return router;
}
