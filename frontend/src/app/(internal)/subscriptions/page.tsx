import {
  EMPTY_SUBSCRIPTION_FILTERS,
  SubscriptionsPage,
} from '@/features/subscriptions/subscriptions-page';

export const metadata = { title: 'Suscripciones · FabSoft' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SubscriptionsRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const value = (key: string): string => {
    const raw = params[key];
    return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  };
  return (
    <SubscriptionsPage
      initialFilters={{
        ...EMPTY_SUBSCRIPTION_FILTERS,
        q: value('q'),
        status: value('status'),
        followUpStatus: value('followUpStatus'),
        expiresFrom: value('expiresFrom'),
        expiresTo: value('expiresTo'),
        ownerUserId: value('ownerUserId'),
      }}
    />
  );
}
