import Anthropic from "@anthropic-ai/sdk";
import { getInitiativeTasks, getProjectTasks, type TWTask } from "@/lib/teamwork";
import { getStrategicTiers } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatDueDate(dueDate: string): string {
  if (!dueDate) return "";
  const d = new Date(dueDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return ` _(overdue ${Math.abs(diffDays)}d)_`;
  if (diffDays === 0) return " _(due today)_";
  if (diffDays === 1) return " _(due tomorrow)_";
  return "";
}

function urgencyScore(task: TWTask): number {
  if (!task["due-date"]) return 9999;
  const d = new Date(task["due-date"].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  return d.getTime();
}

export async function GET(request: Request) {
  // Protect with CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [initiatives, tasks, tiers] = await Promise.all([
      getInitiativeTasks(),
      getProjectTasks(),
      getStrategicTiers(),
    ]);

    // Rank initiatives with LLM
    const vision = tiers.filter((t) => t.tier_type === "vision");
    const annual = tiers.filter((t) => t.tier_type === "annual");
    const operational = tiers.filter((t) => t.tier_type === "operational");

    const strategicContext = `## Strategic Context

### Long-term Vision
${vision.map((v) => `- ${v.name}${v.description ? `: ${v.description}` : ""}`).join("\n") || "- Not set"}

### Annual Must-Wins
${annual.length > 0 ? annual.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n") : "- Not configured yet"}

### Operational Categories
${operational.map((o) => `- ${o.name}`).join("\n")}

You are Keel. Rank these initiatives by strategic importance for today.`;

    const initiativeList = initiatives
      .map((t, i) => `${i + 1}. [ID:${t.id}] "${t.content}"`)
      .join("\n") || "No initiatives.";

    const today = new Date().toLocaleDateString("en-CA", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const rankMessage = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: [{ type: "text", text: strategicContext, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Today is ${today}.\n\nInitiatives:\n${initiativeList}\n\nReturn a JSON array of the top 3–5 initiative IDs in priority order: ["id1","id2",...]. ONLY valid JSON.`,
      }],
    });

    const textBlock = rankMessage.content.find((b) => b.type === "text");
    let rankedIds: string[] = [];
    try {
      const text = textBlock?.type === "text" ? textBlock.text : "[]";
      const match = text.match(/\[[\s\S]*\]/);
      rankedIds = JSON.parse(match ? match[0] : "[]");
    } catch {
      rankedIds = initiatives.slice(0, 5).map((t) => t.id);
    }

    const initiativeMap = new Map(initiatives.map((t) => [t.id, t]));
    const rankedInitiatives = rankedIds
      .map((id) => initiativeMap.get(id))
      .filter((t): t is TWTask => !!t)
      .slice(0, 5);

    // Top 10 GTD tasks sorted by urgency (overdue first, then due soonest, then no date)
    const gtdTasks = [...tasks]
      .sort((a, b) => urgencyScore(a) - urgencyScore(b))
      .slice(0, 10);

    // Format Slack message
    const dateHeader = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://keel.app";

    const deepWorkLines = rankedInitiatives.length > 0
      ? rankedInitiatives.map((t, i) => `${i + 1}. ${t.content}`).join("\n")
      : "_No initiatives in your list yet._";

    const gtdLines = gtdTasks.length > 0
      ? gtdTasks.map((t, i) => `${i + 1}. ${t.content}${formatDueDate(t["due-date"])}`).join("\n")
      : "_No open tasks._";

    const text = `*${dateHeader}*

*Deep Work*
${deepWorkLines}

*Getting Things Done*
${gtdLines}

<${appUrl}|Open Keel →>`;

    // Send DM via Slack API
    const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: process.env.SLACK_USER_ID,
        text,
        mrkdwn: true,
      }),
    });

    const slackData = await slackRes.json();
    if (!slackData.ok) {
      throw new Error(`Slack error: ${slackData.error}`);
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Slack morning error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
