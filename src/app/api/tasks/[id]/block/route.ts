import { createBlockingState, updateBlockingStateFollowUp } from "@/lib/supabase";
import { createSubtask, moveTaskToList } from "@/lib/teamwork";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { block_type, waiting_on, follow_up_date } = body as {
      block_type: "waiting_client" | "waiting_person" | "external";
      waiting_on?: string;
      follow_up_date?: string;
    };

    const reason =
      block_type === "external"
        ? "Externally blocked"
        : `Waiting on ${waiting_on || "someone"}`;

    await createBlockingState({
      teamwork_task_id: id,
      block_type,
      reason,
      waiting_on: waiting_on || null,
      follow_up_date: follow_up_date || null,
    });

    // Move to waiting list in Teamwork
    await moveTaskToList(id, "waiting");

    // Create follow-up subtask for waiting types
    if (block_type === "waiting_client" || block_type === "waiting_person") {
      const content = waiting_on ? `Follow up with ${waiting_on}` : "Follow up";
      const twDate = follow_up_date?.replace(/-/g, "") || undefined;
      try {
        const subtask = await createSubtask(id, content, twDate);
        await updateBlockingStateFollowUp(id, subtask.id);
      } catch {
        // Non-critical — blocking state is still saved
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
