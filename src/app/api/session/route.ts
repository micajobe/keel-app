import Anthropic from "@anthropic-ai/sdk";
import { getProjectTasks, getInitiativeTasks, type TWTask } from "@/lib/teamwork";
import {
  getStrategicTiers,
  getPriorityState,
  clearPriorityState,
  createSession,
  saveSessionTasks,
  upsertPriorityState,
  upsertTaskClassification,
} from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatDueDate(dueDate: string): string {
  if (!dueDate) return "no due date";
  const d = new Date(dueDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  const today = new Date();
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return `OVERDUE by ${Math.abs(diffDays)} days`;
  if (diffDays === 0) return "due TODAY";
  if (diffDays === 1) return "due tomorrow";
  if (diffDays <= 7) return `due in ${diffDays} days`;
  return `due ${d.toLocaleDateString("en-CA")}`;
}

function buildTaskList(tasks: TWTask[]): string {
  if (tasks.length === 0) return "No open tasks.";
  return tasks
    .map((t, i) => {
      const due = formatDueDate(t["due-date"]);
      const tags = t.tags?.map((tag) => tag.name).join(", ") || "";
      const list = t["todo-list-name"] ? ` [${t["todo-list-name"]}]` : "";
      return `${i + 1}. [ID:${t.id}] "${t.content}"${list} — ${due}${tags ? `, tags: ${tags}` : ""}`;
    })
    .join("\n");
}

// ── Deep Work ─────────────────────────────────────────────────────────────────

async function handleDeepWork(refresh: boolean) {
  // ── Check for cached priority state ──────────────────────────────────────
  if (!refresh) {
    const cached = await getPriorityState();
    if (cached.length > 0) {
      const briefing = cached[0].day_briefing ?? "";
      return Response.json({
        sessionId: cached[0].last_session_id,
        dayBriefing: briefing,
        cached: true,
        tasks: cached.map((row) => ({
          id: row.teamwork_task_id,
          title: row.task_title,
          priority_rank: row.sort_order,
          strategic_tier: row.strategic_tier ?? "",
          task_type: row.task_type ?? "",
          reasoning: row.reasoning ?? "",
          estimated_duration: row.estimated_duration ?? "",
        })),
        flags: [],
      });
    }
  }

  // ── Fresh LLM ranking ────────────────────────────────────────────────────
  if (refresh) await clearPriorityState();

  const [initiatives, tiers] = await Promise.all([
    getInitiativeTasks(),
    getStrategicTiers(),
  ]);

  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const vision = tiers.filter((t) => t.tier_type === "vision");
  const annual = tiers.filter((t) => t.tier_type === "annual");

  const strategicContext = `## Strategic Context

### Long-term Vision
${vision.map((v) => `- ${v.name}${v.description ? `: ${v.description}` : ""}`).join("\n") || "- Not set"}

### Annual Must-Wins
${annual.length > 0 ? annual.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n") : "- Not configured yet"}

## Your Role
You are Keel — a strategic prioritization advisor. Rank these initiatives by what deserves focus today given strategic importance, urgency, and momentum. Be direct and concise.`;

  const userMessage = `Today is ${today}.

## Initiatives (${initiatives.length} total)
${buildTaskList(initiatives)}

Return a JSON object:
{
  "day_briefing": "one grounding sentence for Deep Work today",
  "tasks": [
    { "id": "...", "title": "...", "priority_rank": 1, "strategic_tier": "...", "task_type": "...", "reasoning": "5-8 words max", "estimated_duration": "..." }
  ]
}

Return 3–5 tasks, ranked by strategic priority. task_type: infer a short category from the task itself (e.g. "sales", "ops", "product", "relationships", "strategy"). estimated_duration: "< 30 min"/"30-60 min"/"1-2 hours"/"2+ hours". Respond with ONLY valid JSON.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [{ type: "text", text: strategicContext, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  let parsed: {
    day_briefing: string;
    tasks: { id: string; title: string; priority_rank: number; strategic_tier: string; task_type: string; reasoning: string; estimated_duration: string }[];
  };

  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    const match = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(match ? match[1] : textBlock.text);
  }

  const session = await createSession("deep_work", parsed.day_briefing);

  if (parsed.tasks.length > 0) {
    await saveSessionTasks(session.id, parsed.tasks.map((t) => ({
      teamwork_task_id: t.id, task_title: t.title, sort_order: t.priority_rank,
    })));
    await upsertPriorityState(parsed.tasks.map((t) => ({
      teamwork_task_id: t.id, task_title: t.title, sort_order: t.priority_rank,
      is_visible: true, last_session_id: session.id,
      reasoning: t.reasoning, task_type: t.task_type,
      strategic_tier: t.strategic_tier, estimated_duration: t.estimated_duration,
      day_briefing: parsed.day_briefing,
    })));
    Promise.all(parsed.tasks.map((t) =>
      upsertTaskClassification({
        teamwork_task_id: t.id,
        teamwork_project_id: process.env.TEAMWORK_PROJECT_ID!,
        strategic_tier_id: null,
        task_type: t.task_type as never,
        inferred_by: "llm",
        llm_reasoning: t.reasoning,
      })
    )).catch(() => {});
  }

  return Response.json({
    sessionId: session.id,
    dayBriefing: parsed.day_briefing,
    cached: false,
    tasks: parsed.tasks,
    flags: [],
  });
}

// ── Get Things Done ───────────────────────────────────────────────────────────

async function handleGetThingsDone() {
  const tasks = await getProjectTasks();

  // Create a lightweight session — no LLM, no pre-populated session_tasks
  const session = await createSession("get_things_done", null);

  // Serialize tasks for client-side sorting
  const serialized = tasks.map((t) => ({
    id: t.id,
    title: t.content,
    due_date: t["due-date"] || null,
    created_on: t["created-on"],
    list_name: t["todo-list-name"],
    has_subtasks: t["has-subtasks"],
    tags: t.tags?.map((tag) => tag.name) ?? [],
    priority: t.priority,
    priority_rank: 0,
    strategic_tier: "",
    task_type: "",
    reasoning: "",
    estimated_duration: "",
  }));

  return Response.json({
    sessionId: session.id,
    dayBriefing: null,
    tasks: serialized,
    flags: [],
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { mode, refresh } = (await request.json()) as {
      mode: "deep_work" | "get_things_done";
      refresh?: boolean;
    };

    if (mode === "deep_work") return handleDeepWork(!!refresh);
    if (mode === "get_things_done") return handleGetThingsDone();

    return Response.json({ error: "Invalid mode" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Session API error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
