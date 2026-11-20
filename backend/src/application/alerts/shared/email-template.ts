import type { AlertEmailTemplate } from '@fabsoft/shared';

export interface AlertEmailTemplateQuery {
  get(): Promise<AlertEmailTemplate>;
}

export interface AlertEmailTemplateRepository extends AlertEmailTemplateQuery {
  update(template: AlertEmailTemplate, updatedBy: string): Promise<AlertEmailTemplate>;
}

export interface AlertEmailTemplateRepos {
  alertEmailTemplate: AlertEmailTemplateRepository;
}
