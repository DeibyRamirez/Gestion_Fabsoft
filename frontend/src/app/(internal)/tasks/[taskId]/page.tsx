import { TaskDetailView } from '@/features/tasks/task-detail-view';

export const metadata = { title: 'Tarea · FabSoft' };

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <TaskDetailView taskId={taskId} />;
}
