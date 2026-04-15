import { createTask } from "@/lib/teamwork";

export async function POST(request: Request) {
  try {
    const { content } = await request.json() as { content: string };

    if (!content?.trim()) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }

    const task = await createTask(content.trim(), "inbox");
    return Response.json({ id: task.id, content: content.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
