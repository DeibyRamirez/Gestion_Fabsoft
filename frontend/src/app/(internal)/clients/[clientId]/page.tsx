import { ClientDetailView } from '@/features/clients/client-detail-view';

export const metadata = { title: 'Cliente · FabSoft' };

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  return <ClientDetailView clientId={clientId} created={query.created === '1'} />;
}
