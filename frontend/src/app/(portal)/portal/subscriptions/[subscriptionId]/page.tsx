import { PortalSubscriptionDetail } from '@/features/portal/portal-subscription-detail';

export const metadata = { title: 'Suscripción · Portal FabSoft' };

export default async function PortalSubscriptionPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;
  return <PortalSubscriptionDetail subscriptionId={subscriptionId} />;
}
