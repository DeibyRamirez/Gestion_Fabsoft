import { IntegrationDetail } from '@/features/integrations/integration-detail';

export const metadata = { title: 'Integración · FabSoft' };

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const { integrationId } = await params;
  return <IntegrationDetail integrationId={integrationId} />;
}
