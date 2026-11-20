import { GetSettings } from '../../application/settings/get-settings/use-case.js';
import { UpdateSettings } from '../../application/settings/update-settings/use-case.js';
import type { Infra } from '../infra.js';

export function settingsModule(infra: Infra) {
  return {
    getSettings: new GetSettings(infra.userUow),
    updateSettings: new UpdateSettings(infra.userUow),
  };
}
