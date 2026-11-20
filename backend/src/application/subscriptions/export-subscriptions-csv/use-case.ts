import { MAX_PAGE_SIZE, type SubscriptionListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { toCsv } from '../../shared/csv.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { ListSubscriptions } from '../list-subscriptions/use-case.js';

export interface CsvExport {
  filename: string;
  csv: string;
}

export class ExportSubscriptionsCsv {
  constructor(private readonly listSubscriptions: ListSubscriptions) {}

  async execute(actor: UserActor, query: SubscriptionListQuery): Promise<CsvExport> {
    const items: SubscriptionView[] = [];
    let page = 1;
    while (true) {
      const result = await this.listSubscriptions.execute(actor, {
        ...query,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      items.push(...result.items);
      if (items.length >= result.total || result.items.length === 0) break;
      page++;
    }

    const rows = items.map((subscription) => [
      subscription.client.legalName,
      subscription.product.name,
      subscription.currentPeriodEnd,
      subscription.status,
      `${subscription.priceAmount.toFixed(2)} ${subscription.currency}`,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      filename: `suscripciones-${today}.csv`,
      csv: toCsv(['Cliente', 'Producto', 'Vence', 'Estado', 'Precio'], rows),
    };
  }
}
