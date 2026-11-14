import { ClientDetailView } from '@/features/clients/client-detail-view';

export const metadata = { title: 'Cliente · FabSoft' };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientDetailView clientId={clientId} />;
}