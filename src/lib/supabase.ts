import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey;

// Browser client — safe for client components
export const supabase = createClient(url, anonKey);

// Server client — full access, server-side only
export const supabaseAdmin = createClient(url, serviceKey);

export type StrategicTier = {
  id: string;
  tier_type: "vision" | "annual" | "operational";
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  year: number | null;
  sort_order: number;
};

export type TaskClassification = {
  id: string;
  teamwork_task_id: string;
  teamwork_project_id: string;
  strategic_tier_id: string | null;
  task_type: string | null;
  inferred_by: "llm" | "user";
  llm_reasoning: string | null;
};

export type PrioritySession = {
  id: string;
  mode: "deep_work" | "get_things_done";
  llm_reasoning: string | null;
  started_at: string;
  completed_at: string | null;
};

export type SessionTask = {
  id: string;
  session_id: string;
  teamwork_task_id: string;
  task_title: string;
  sort_order: number;
  completed_at: string | null;
  completed_in_keel: boolean;
};

export type PriorityStateRow = {
  id: string;
  teamwork_task_id: string;
  task_title: string;
  sort_order: number;
  is_visible: boolean;
  updated_at: string;
};

export async function getStrategicTiers(): Promise<StrategicTier[]> {
  const { data, error } = await supabaseAdmin
    .from("strategic_tiers")
    .select("*")
    .eq("is_active", true)
    .order("tier_type")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function getTaskClassifications(): Promise<TaskClassification[]> {
  const { data, error } = await supabaseAdmin
    .from("task_classifications")
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function upsertTaskClassification(
  classification: Omit<TaskClassification, "id">
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("task_classifications")
    .upsert(classification, { onConflict: "teamwork_task_id" });
  if (error) throw error;
}

export async function getPriorityState(): Promise<PriorityStateRow[]> {
  const { data, error } = await supabaseAdmin
    .from("priority_state")
    .select("*")
    .eq("is_visible", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function upsertPriorityState(
  tasks: Omit<PriorityStateRow, "id" | "updated_at">[]
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("priority_state")
    .upsert(tasks, { onConflict: "teamwork_task_id" });
  if (error) throw error;
}

export async function createSession(
  mode: PrioritySession["mode"],
  llmReasoning: string | null
): Promise<PrioritySession> {
  const { data, error } = await supabaseAdmin
    .from("priority_sessions")
    .insert({ mode, llm_reasoning: llmReasoning })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveSessionTasks(
  sessionId: string,
  tasks: { teamwork_task_id: string; task_title: string; sort_order: number }[]
): Promise<void> {
  const { error } = await supabaseAdmin.from("session_tasks").insert(
    tasks.map((t) => ({ session_id: sessionId, ...t }))
  );
  if (error) throw error;
}

// ── Reflect ──────────────────────────────────────────────────────────────────

export type WeeklyCompletion = {
  id: string;
  teamwork_task_id: string;
  task_title: string;
  task_type: string | null;
  strategic_tier_id: string | null;
  completed_at: string;
};

export type ActiveBlockingState = {
  teamwork_task_id: string;
  block_type: string;
  reason: string;
  waiting_on: string | null;
  created_at: string;
};

export async function getWeeklyCompletions(
  year: number,
  week: number
): Promise<WeeklyCompletion[]> {
  const { data, error } = await supabaseAdmin
    .from("completions")
    .select("id, teamwork_task_id, task_title, task_type, strategic_tier_id, completed_at")
    .eq("year", year)
    .eq("week_number", week)
    .neq("task_title", "")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getActiveBlockingStates(): Promise<ActiveBlockingState[]> {
  const { data, error } = await supabaseAdmin
    .from("blocking_states")
    .select("teamwork_task_id, block_type, reason, waiting_on, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Delta ─────────────────────────────────────────────────────────────────────

export type DeltaResult = {
  newTaskIds: string[];
  newOverdueIds: string[];
};

export async function getLastSessionTimestamp(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("priority_sessions")
    .select("started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  return data?.started_at ?? null;
}

// ── Blocking states ───────────────────────────────────────────────────────────

export async function createBlockingState(data: {
  teamwork_task_id: string;
  block_type: "waiting_client" | "waiting_person" | "external";
  reason: string;
  waiting_on?: string | null;
  follow_up_date?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("blocking_states").insert(data);
  if (error) throw error;
}

export async function updateBlockingStateFollowUp(
  teamworkTaskId: string,
  followUpTaskId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("blocking_states")
    .update({ follow_up_task_id: followUpTaskId })
    .eq("teamwork_task_id", teamworkTaskId)
    .is("resolved_at", null);
  if (error) throw error;
}

export async function markTaskComplete(
  teamworkTaskId: string,
  taskTitle: string,
  sessionId?: string
): Promise<void> {
  const now = new Date().toISOString();

  // Mark complete in session_tasks if in an active session
  if (sessionId) {
    await supabaseAdmin
      .from("session_tasks")
      .update({ completed_at: now, completed_in_keel: true })
      .eq("session_id", sessionId)
      .eq("teamwork_task_id", teamworkTaskId);
  }

  // Remove from priority state
  await supabaseAdmin
    .from("priority_state")
    .update({ is_visible: false })
    .eq("teamwork_task_id", teamworkTaskId);

  // Log to completions
  const { data: classification } = await supabaseAdmin
    .from("task_classifications")
    .select("strategic_tier_id, task_type")
    .eq("teamwork_task_id", teamworkTaskId)
    .single();

  const now_date = new Date();
  const startOfYear = new Date(now_date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((now_date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );

  await supabaseAdmin.from("completions").insert({
    teamwork_task_id: teamworkTaskId,
    task_title: taskTitle,
    strategic_tier_id: classification?.strategic_tier_id ?? null,
    task_type: classification?.task_type ?? null,
    session_id: sessionId ?? null,
    week_number: weekNumber,
    year: now_date.getFullYear(),
  });
}
