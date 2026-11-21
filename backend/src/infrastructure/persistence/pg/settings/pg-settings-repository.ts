import type { ContactChannel, Settings } from '@fabsoft/shared';
import { DEFAULT_SETTINGS } from '@fabsoft/shared';
import type { SettingsRepository } from '../../../../application/settings/shared/settings.js';
import type { Tx } from '../../../db/with-rls-context.js';

const KEY = 'contact_channel';

function parseContactChannel(value: unknown): ContactChannel | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    email: typeof record['email'] === 'string' ? record['email'] : null,
    phone: typeof record['phone'] === 'string' ? record['phone'] : null,
    hours: typeof record['hours'] === 'string' ? record['hours'] : null,
  };
}

export class PgSettingsRepository implements SettingsRepository {
  constructor(private readonly tx: Tx) {}

  async get(): Promise<Settings> {
    const { rows } = await this.tx.query<{ value: unknown }>(
      `select value from app.app_settings where key = $1 limit 1`,
      [KEY],
    );
    const contactChannel = parseContactChannel(rows[0]?.value) ?? {
      ...DEFAULT_SETTINGS.contactChannel,
    };
    return { contactChannel };
  }

  async update(settings: Settings, updatedBy: string): Promise<Settings> {
    const { rows } = await this.tx.query<{ value: unknown }>(
      `insert into app.app_settings (key, value, updated_by)
       values ($1, $2::jsonb, $3)
       on conflict (key) do update
         set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
       returning value`,
      [KEY, JSON.stringify(settings.contactChannel), updatedBy],
    );
    const contactChannel = parseContactChannel(rows[0]?.value) ?? settings.contactChannel;
    return { contactChannel };
  }
}
