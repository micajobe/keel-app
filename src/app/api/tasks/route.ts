import { getProjectTasks } from "@/lib/teamwork";
import { getPriorityState } from "@/lib/supabase";

export async function GET() {
  try {
    const [tasks, priorityState] = await Promise.all([
      getProjectTasks(),
      getPriorityState(),
    ]);

    const priorityMap = new Map(
      priorityState.map((p) => [p.teamwork_task_id, p])
    );

    return Response.json({ tasks, priorityState: priorityMap.size > 0 ? priorityState : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
