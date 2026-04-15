import Anthropic from "@anthropic-ai/sdk";
import {
  getWeeklyCompletions,
  getActiveBlockingStates,
  getStrategicTiers,
} from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TYPE_LABELS: Record<string, string> = {
  sales: "Sales",
  business_development: "Business Development",
  relationships: "Relationships",
  culture: "Culture",
  strategic: "Strategic",
  admin: "Admin",
  other: "Other",
};

const TYPE_ORDER = [
  "sales",
  "business_development",
  "relationships",
  "culture",
  "strategic",
  "admin",
  "other",
];

function currentWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 +
      startOfYear.getDay() +
      1) /
      7
  );
}

function weekLabel(year: number, week: number): string {
  const jan1 = new Date(year, 0, 1);
  const daysToAdd = (week - 1) * 7 - jan1.getDay();
  const start = new Date(year, 0, 1 + daysToAdd);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week ${week} · ${fmt(start)}–${fmt(end)}`;
}

export async function GET() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const week = currentWeekNumber(now);

    const [completions, tiers, blocked] = await Promise.all([
      getWeeklyCompletions(year, week),
      getStrategicTiers(),
      getActiveBlockingStates(),
    ]);

    // Build strategic context (identical to session route for cache reuse)
    const vision = tiers.filter((t) => t.tier_type === "vision");
    const annual = tiers.filter((t) => t.tier_type === "annual");
    const operational = tiers.filter((t) => t.tier_type === "operational");

    const strategicContext = `## Strategic Context

### Long-term Vision
${vision.map((v) => `- ${v.name}${v.description ? `: ${v.description}` : ""}`).join("\n") || "- Not set"}

### Annual Must-Wins (This Year)
${annual.length > 0 ? annual.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n") : "- Not configured yet"}

### Operational Categories
${operational.map((o) => `- ${o.name}`).join("\n")}

## Your Role
You are Keel — a strategic prioritization advisor. You help surface the work that matters most, connecting daily tasks to long-term goals. You are calm, direct, and insightful.`;

    // Build completion lines for LLM
    const completionLines =
      completions.length > 0
        ? completions
            .map((c) => {
              const label = c.task_type
                ? (TYPE_LABELS[c.task_type] ?? c.task_type)
                : "Uncategorized";
              return `- "${c.task_title}" [${label}]`;
            })
            .join("\n")
        : "No tasks completed this week yet.";

    const blockedLines =
      blocked.length > 0
        ? blocked.map((b) => `- ${b.reason}`).join("\n")
        : "None.";

    const label = weekLabel(year, week);
    const today = now.toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const userMessage = `Today is ${today}. ${label}.

## Completed This Week (${completions.length} task${completions.length !== 1 ? "s" : ""})
${completionLines}

## Still Parked / Blocked
${blockedLines}

Write a short weekly reflection (2–4 sentences, conversational, first person) that:
1. Acknowledges what was accomplished and which strategic areas it touched
2. Notes any patterns, momentum, or gaps worth watching
3. Ends with a grounding forward-looking thought

Be direct and honest. Prose only — no bullets, no headers. Don't start with "This week". Respond with ONLY the reflection text.`;

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: strategicContext,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const synthesis = textBlock?.type === "text" ? textBlock.text.trim() : "";

    // Group completions by task_type for the UI
    const byType: Record<string, string[]> = {};
    for (const c of completions) {
      const type = c.task_type ?? "other";
      if (!byType[type]) byType[type] = [];
      byType[type].push(c.task_title);
    }

    const grouped = TYPE_ORDER.filter((t) => byType[t])
      .map((t) => ({ label: TYPE_LABELS[t] ?? "Other", tasks: byType[t] }));

    // Include any types not in the canonical order
    for (const t of Object.keys(byType)) {
      if (!TYPE_ORDER.includes(t)) {
        grouped.push({ label: TYPE_LABELS[t] ?? t, tasks: byType[t] });
      }
    }

    return Response.json({
      synthesis,
      weekLabel: label,
      totalCompleted: completions.length,
      grouped,
      stillBlocked: blocked.map((b) => ({
        reason: b.reason,
        waiting_on: b.waiting_on,
        block_type: b.block_type,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Reflect API error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
