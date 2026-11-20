import {
  AlertEmailTemplateSchema,
  AlertRuleUpdateSchema,
  type AlertEmailTemplate,
  type AlertRuleDto,
  type AlertRuleList,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { GetAlertEmailTemplate } from '../../../../application/alerts/get-email-template/use-case.js';
import type { ListAlertRules } from '../../../../application/alerts/list-alert-rules/use-case.js';
import type { AlertRuleView } from '../../../../application/alerts/shared/alert-rule-view.js';
import type { UpdateAlertEmailTemplate } from '../../../../application/alerts/update-email-template/use-case.js';
import type { UpdateAlertRule } from '../../../../application/alerts/update-alert-rule/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface AlertRulesRouteDeps {
  listAlertRules: ListAlertRules;
  updateAlertRule: UpdateAlertRule;
  getAlertEmailTemplate: GetAlertEmailTemplate;
  updateAlertEmailTemplate: UpdateAlertEmailTemplate;
}

const IdSchema = z.string().uuid();

export const toAlertRuleDto = (rule: AlertRuleView): AlertRuleDto => ({
  id: rule.id,
  code: rule.code,
  description: rule.description,
  offsetDays: rule.offsetDays,
  channels: rule.channels,
  createsTask: rule.createsTask,
  taskType: rule.taskType,
  taskPriority: rule.taskPriority,
  appliesWhenNotRenewable: rule.appliesWhenNotRenewable,
  isActive: rule.isActive,
});

export function alertRulesRouter(deps: AlertRulesRouteDeps, guards: RequestHandler[]): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];
  const admin = [...guards, requireRole('admin')];

  router.get('/alert-rules', ...staff, async (_req, res) => {
    const rules = await deps.listAlertRules.execute(actorOf(res));
    const body: AlertRuleList = { data: rules.map(toAlertRuleDto) };
    res.json(body);
  });

  router.get('/alert-rules/email-template', ...staff, async (_req, res) => {
    res.json(await deps.getAlertEmailTemplate.execute(actorOf(res)));
  });

  router.patch('/alert-rules/email-template', ...admin, async (req, res) => {
    const template: AlertEmailTemplate = AlertEmailTemplateSchema.parse(req.body);
    res.json(await deps.updateAlertEmailTemplate.execute(actorOf(res), template));
  });

  router.patch('/alert-rules/:id', ...admin, async (req, res) => {
    const input = AlertRuleUpdateSchema.parse(req.body);
    const rule = await deps.updateAlertRule.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      input,
    );
    res.json(toAlertRuleDto(rule));
  });

  return router;
}
