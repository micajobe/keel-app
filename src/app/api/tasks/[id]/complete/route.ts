import { completeTask } from "@/lib/teamwork";
import { markTaskComplete } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { sessionId, taskTitle = "" } = body as { sessionId?: string; taskTitle?: string };

    await Promise.all([
      completeTask(id),
      markTaskComplete(id, taskTitle, sessionId),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
