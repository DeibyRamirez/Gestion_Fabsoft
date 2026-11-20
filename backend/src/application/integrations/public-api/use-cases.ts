import type {
  ClientListQuery,
  ProductListQuery,
  RenewalRequestCreateInput,
  RenewalRequestListQuery,
  SubscriptionListQuery,
  TaskListQuery,
} from '@fabsoft/shared';
import type { IntegrationActor as IntegrationActorType } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { GetClientRepos } from '../../clients/get-client/ports.js';
import type { ListClientsRepos } from '../../clients/list-clients/ports.js';
import type { GetProductRepos } from '../../products/get-product/ports.js';
import type { ListProductsRepos } from '../../products/list-products/ports.js';
import type { GetSubscriptionQuery } from '../../subscriptions/get-subscription/ports.js';
import type { ListSubscriptionsQuery } from '../../subscriptions/list-subscriptions/ports.js';
import type { SubscriptionPeriodView } from '../../subscriptions/shared/subscription-view.js';
import type {
  GetRenewalRequestRepos,
  ListRenewalRequestsRepos,
} from '../../renewal-requests/list-renewal-requests/ports.js';
import type { GetTaskRepos } from '../../tasks/get-task/ports.js';
import type { ListTasksRepos } from '../../tasks/list-tasks/ports.js';
import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import type {
  CreateIntegrationRenewalRequestRepos,
  CreatedIntegrationRenewalRequestView,
  IntegrationPeriodsRepos,
} from './ports.js';

export class ListIntegrationClients {
  constructor(private readonly uow: UnitOfWork<ListClientsRepos>) {}
  async execute(actor: IntegrationActorType, query: ClientListQuery) {
    return this.uow.run(actor, ({ clientsList }) => clientsList.list(query));
  }
}

export class GetIntegrationClient {
  constructor(private readonly uow: UnitOfWork<GetClientRepos>) {}
  async execute(actor: IntegrationActorType, id: string) {
    const client = await this.uow.run(actor, ({ clientDetail }) => clientDetail.findById(id));
    if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
    return client;
  }
}

export class ListIntegrationProducts {
  constructor(private readonly uow: UnitOfWork<ListProductsRepos>) {}
  async execute(actor: IntegrationActorType, query: ProductListQuery) {
    return this.uow.run(actor, ({ productsList }) => productsList.list(query));
  }
}

export class GetIntegrationProduct {
  constructor(private readonly uow: UnitOfWork<GetProductRepos>) {}
  async execute(actor: IntegrationActorType, id: string) {
    const product = await this.uow.run(actor, ({ productDetail }) => productDetail.findById(id));
    if (!product) throw new ApplicationError('not_found', 'Producto no encontrado');
    return product;
  }
}

type IntegrationSubscriptionListRepos = {
  integrationSubscriptions: ListSubscriptionsQuery;
};
type IntegrationSubscriptionDetailRepos = {
  integrationSubscriptionDetail: GetSubscriptionQuery;
};

export class ListIntegrationSubscriptions {
  constructor(private readonly uow: UnitOfWork<IntegrationSubscriptionListRepos>) {}
  async execute(actor: IntegrationActorType, query: SubscriptionListQuery) {
    return this.uow.run(actor, ({ integrationSubscriptions }) =>
      integrationSubscriptions.list(query),
    );
  }
}

export class GetIntegrationSubscription {
  constructor(private readonly uow: UnitOfWork<IntegrationSubscriptionDetailRepos>) {}
  async execute(actor: IntegrationActorType, id: string) {
    const subscription = await this.uow.run(actor, ({ integrationSubscriptionDetail }) =>
      integrationSubscriptionDetail.findById(id),
    );
    if (!subscription) throw new ApplicationError('not_found', 'Suscripción no encontrada');
    return subscription;
  }
}

export class ListIntegrationSubscriptionPeriods {
  constructor(private readonly uow: UnitOfWork<IntegrationPeriodsRepos>) {}
  async execute(actor: IntegrationActorType, subscriptionId: string): Promise<SubscriptionPeriodView[]> {
    return this.uow.run(actor, ({ integrationPeriods }) =>
      integrationPeriods.listPeriods(subscriptionId),
    );
  }
}

export class ListIntegrationRenewalRequests {
  constructor(private readonly uow: UnitOfWork<ListRenewalRequestsRepos>) {}
  async execute(actor: IntegrationActorType, query: RenewalRequestListQuery) {
    return this.uow.run(actor, ({ renewalRequestsList }) => renewalRequestsList.list(query));
  }
}

export class GetIntegrationRenewalRequest {
  constructor(private readonly uow: UnitOfWork<GetRenewalRequestRepos>) {}
  async execute(actor: IntegrationActorType, id: string) {
    const request = await this.uow.run(actor, ({ renewalRequestDetail }) =>
      renewalRequestDetail.findById(id),
    );
    if (!request) throw new ApplicationError('not_found', 'Solicitud no encontrada');
    return request;
  }
}

export class ListIntegrationTasks {
  constructor(
    private readonly uow: UnitOfWork<ListTasksRepos>,
    private readonly clock: Clock,
  ) {}
  async execute(actor: IntegrationActorType, query: TaskListQuery) {
    if (query.assigneeUserId === 'me') {
      throw new ApplicationError('validation_error', 'assigneeUserId=me no aplica a integraciones');
    }
    return this.uow.run(actor, ({ tasksList }) =>
      tasksList.list({ ...query, today: toBogotaLocalDate(this.clock.now()) }),
    );
  }
}

export class GetIntegrationTask {
  constructor(private readonly uow: UnitOfWork<GetTaskRepos>) {}
  async execute(actor: IntegrationActorType, id: string) {
    const task = await this.uow.run(actor, ({ taskDetail }) => taskDetail.findById(id));
    if (!task) throw new ApplicationError('not_found', 'Tarea no encontrada');
    return task;
  }
}

type CreateIntegrationRenewalRequestUow = CreateIntegrationRenewalRequestRepos & {
  audit: AuditWriter;
};

export class CreateIntegrationRenewalRequest {
  constructor(private readonly uow: UnitOfWork<CreateIntegrationRenewalRequestUow>) {}

  async execute(
    actor: IntegrationActorType,
    input: RenewalRequestCreateInput,
  ): Promise<CreatedIntegrationRenewalRequestView> {
    return this.uow.run(actor, async ({ integrationRequestCreate, audit }) => {
      const subscription = await integrationRequestCreate.findForIntegration(
        actor.integrationId,
        input.subscriptionId,
      );
      if (!subscription) {
        throw new ApplicationError('not_found', 'Suscripción no encontrada');
      }
      if (subscription.status === 'cancelada' || subscription.status === 'no_renovada') {
        throw new ApplicationError(
          'invalid_state_transition',
          'No se puede solicitar renovación de una suscripción terminal',
        );
      }
      const request = await integrationRequestCreate.insert({
        subscriptionId: subscription.id,
        clientId: subscription.clientId,
        requestedByIntegrationId: actor.integrationId,
        comment: input.comment ?? null,
      });
      await audit.write({
        actor: { type: 'integration', integrationId: actor.integrationId },
        action: 'renewal_request.created',
        resourceType: 'renewal_request',
        resourceId: request.id,
        changes: {
          after: {
            subscriptionId: request.subscriptionId,
            clientId: request.clientId,
            comment: request.comment,
            status: request.status,
          },
        },
        requestId: actor.requestId,
      });
      return request;
    });
  }
}
