import { getProjectTasks } from "@/lib/teamwork";
import { getLastSessionTimestamp, getPriorityState } from "@/lib/supabase";

export async function GET() {
  try {
    const [tasks, lastSessionAt, priorityState] = await Promise.all([
      getProjectTasks(),
      getLastSessionTimestamp(),
      getPriorityState(),
    ]);

    const knownIds = new Set(priorityState.map((p) => p.teamwork_task_id));
    const lastSession = lastSessionAt ? new Date(lastSessionAt) : null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newCount = 0;
    let overdueCount = 0;

    for (const task of tasks) {
      const isKnown = knownIds.has(task.id);

      // New: added after last session (or all tasks if no session yet)
      if (!isKnown) {
        if (lastSession) {
          const createdAt = new Date(task["created-on"]);
          if (createdAt > lastSession) newCount++;
        }
        // If no session yet, don't surface "new" — nothing to compare against
      }

      // Overdue: has a due date that has passed
      if (task["due-date"]) {
        const due = new Date(
          task["due-date"].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
        );
        if (due < today) overdueCount++;
      }
    }

    return Response.json({ newCount, overdueCount, hasSession: !!lastSession });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
