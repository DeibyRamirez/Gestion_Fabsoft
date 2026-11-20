import type { TaskView } from './task-view.js';

export const taskAuditSnapshot = (t: TaskView) => ({
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate,
  assigneeUserId: t.assignee?.id ?? null,
  notes: t.notes,
  nextAction: t.nextAction,
  outcome: t.outcome,
});
