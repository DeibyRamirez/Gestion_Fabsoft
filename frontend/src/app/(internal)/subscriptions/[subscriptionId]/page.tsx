import { SubscriptionDetailView } from '@/features/subscriptions/subscription-detail-view';

export const metadata = { title: 'Suscripción · FabSoft' };

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;
  return <SubscriptionDetailView subscriptionId={subscriptionId} />;
}
