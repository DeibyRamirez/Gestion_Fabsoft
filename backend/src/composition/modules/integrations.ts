import { AuthenticateApiKey } from '../../application/integrations/authenticate-api-key/use-case.js';
import { CreateIntegration } from '../../application/integrations/create-integration/use-case.js';
import { CreateIntegrationCredential } from '../../application/integrations/create-credential/use-case.js';
import { GetIntegration } from '../../application/integrations/get-integration/use-case.js';
import { ListIntegrationCredentials } from '../../application/integrations/list-credentials/use-case.js';
import { ListIntegrations } from '../../application/integrations/list-integrations/use-case.js';
import { ReplaceIntegrationManifest } from '../../application/integrations/replace-manifest/use-case.js';
import { RevokeIntegrationCredential } from '../../application/integrations/revoke-credential/use-case.js';
import { UpdateIntegration } from '../../application/integrations/update-integration/use-case.js';
import {
  CreateIntegrationRenewalRequest,
  GetIntegrationClient,
  GetIntegrationProduct,
  GetIntegrationRenewalRequest,
  GetIntegrationSubscription,
  GetIntegrationTask,
  ListIntegrationClients,
  ListIntegrationProducts,
  ListIntegrationRenewalRequests,
  ListIntegrationSubscriptions,
  ListIntegrationSubscriptionPeriods,
  ListIntegrationTasks,
} from '../../application/integrations/public-api/use-cases.js';
import type { Infra } from '../infra.js';

export function integrationsModule(infra: Infra) {
  return {
    listIntegrations: new ListIntegrations(infra.userUow),
    getIntegration: new GetIntegration(infra.userUow),
    createIntegration: new CreateIntegration(infra.userUow),
    updateIntegration: new UpdateIntegration(infra.userUow),
    replaceIntegrationManifest: new ReplaceIntegrationManifest(infra.userUow),
    listIntegrationCredentials: new ListIntegrationCredentials(infra.userUow),
    createIntegrationCredential: new CreateIntegrationCredential(
      infra.userUow,
      infra.apiKeys,
      infra.clock,
    ),
    revokeIntegrationCredential: new RevokeIntegrationCredential(infra.userUow, infra.clock),
    authenticateApiKey: new AuthenticateApiKey(infra.authUow, infra.apiKeys, infra.clock),
    listIntegrationClients: new ListIntegrationClients(infra.userUow),
    getIntegrationClient: new GetIntegrationClient(infra.userUow),
    listIntegrationProducts: new ListIntegrationProducts(infra.userUow),
    getIntegrationProduct: new GetIntegrationProduct(infra.userUow),
    listIntegrationSubscriptions: new ListIntegrationSubscriptions(infra.userUow),
    getIntegrationSubscription: new GetIntegrationSubscription(infra.userUow),
    listIntegrationSubscriptionPeriods: new ListIntegrationSubscriptionPeriods(infra.userUow),
    listIntegrationRenewalRequests: new ListIntegrationRenewalRequests(infra.userUow),
    getIntegrationRenewalRequest: new GetIntegrationRenewalRequest(infra.userUow),
    createIntegrationRenewalRequest: new CreateIntegrationRenewalRequest(infra.userUow),
    listIntegrationTasks: new ListIntegrationTasks(infra.userUow, infra.clock),
    getIntegrationTask: new GetIntegrationTask(infra.userUow),
    integrationRateLimiter: infra.integrationRateLimiter,
    clock: infra.clock,
  };
}
