import { DEFAULT_TASK_FILTERS, TasksPage } from '@/features/tasks/tasks-page';

export const metadata = { title: 'Tareas · FabSoft' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TasksRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const value = (key: string): string => {
    const raw = params[key];
    return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  };
  return (
    <TasksPage
      initialFilters={{
        ...DEFAULT_TASK_FILTERS,
        status: value('status') || DEFAULT_TASK_FILTERS.status,
        priority: value('priority'),
        assignee: value('assigneeUserId'),
        overdue: value('overdue') === 'true',
        dueFrom: value('dueFrom'),
        dueTo: value('dueTo'),
      }}
    />
  );
}
