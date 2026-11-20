import { NotificationsPage } from '@/features/notifications/notifications-page';

export const metadata = { title: 'Alertas · FabSoft' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NotificationsRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const raw = params['status'];
  const status = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return <NotificationsPage initialStatus={status} />;
}
