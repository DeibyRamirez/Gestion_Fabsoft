import type { Settings } from '@fabsoft/shared';

export interface SettingsQuery {
  get(): Promise<Settings>;
}

export interface SettingsRepository extends SettingsQuery {
  update(settings: Settings, updatedBy: string): Promise<Settings>;
}

export interface SettingsRepos {
  settings: SettingsRepository;
}
