import { RenewalRequestsPage } from '@/features/renewal-requests/renewal-requests-page';

export const metadata = { title: 'Solicitudes · FabSoft' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RenewalRequestsRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const raw = params['status'];
  const status = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return <RenewalRequestsPage initialStatus={status} />;
}
