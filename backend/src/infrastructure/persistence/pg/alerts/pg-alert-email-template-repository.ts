import { DEFAULT_ALERT_EMAIL_TEMPLATE, type AlertEmailTemplate } from '@fabsoft/shared';
import type { AlertEmailTemplateRepository } from '../../../../application/alerts/shared/email-template.js';
import type { Tx } from '../../../db/with-rls-context.js';

const KEY = 'alert_email_template';

function parseTemplate(value: unknown): AlertEmailTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['subject'] !== 'string' || typeof record['body'] !== 'string') return null;
  return { subject: record['subject'], body: record['body'] };
}

export class PgAlertEmailTemplateRepository implements AlertEmailTemplateRepository {
  constructor(private readonly tx: Tx) {}

  async get(): Promise<AlertEmailTemplate> {
    const { rows } = await this.tx.query<{ value: unknown }>(
      `select value from app.app_settings where key = $1 limit 1`,
      [KEY],
    );
    return parseTemplate(rows[0]?.value) ?? { ...DEFAULT_ALERT_EMAIL_TEMPLATE };
  }

  async update(template: AlertEmailTemplate, updatedBy: string): Promise<AlertEmailTemplate> {
    const { rows } = await this.tx.query<{ value: unknown }>(
      `insert into app.app_settings (key, value, updated_by)
       values ($1, $2::jsonb, $3)
       on conflict (key) do update
         set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
       returning value`,
      [KEY, JSON.stringify(template), updatedBy],
    );
    return parseTemplate(rows[0]?.value) ?? template;
  }
}
