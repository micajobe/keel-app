const BASE_URL = process.env.TEAMWORK_BASE_URL!;
const API_KEY = process.env.TEAMWORK_API_KEY!;
const PROJECT_ID = process.env.TEAMWORK_PROJECT_ID!;

const LIST_IDS = {
  inbox: process.env.TEAMWORK_LIST_INBOX!,
  in_progress: process.env.TEAMWORK_LIST_IN_PROGRESS!,
  waiting: process.env.TEAMWORK_LIST_WAITING!,
  done: process.env.TEAMWORK_LIST_DONE!,
  initiatives: process.env.TEAMWORK_LIST_INITIATIVES!,
};

export type TaskList = keyof typeof LIST_IDS;

function authHeader() {
  const token = Buffer.from(`${API_KEY}:`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

async function tw<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeader(), ...options?.headers },
  });
  if (!res.ok) throw new Error(`Teamwork ${path} → ${res.status}`);
  return res.json();
}

export interface TWTask {
  id: string;
  "todo-list-id": string;
  "todo-list-name": string;
  content: string;
  description: string;
  priority: string;
  "due-date": string;
  "start-date": string;
  completed: boolean;
  "date-completed": string;
  "created-on": string;
  "last-changed-on": string;
  "has-subtasks": boolean;
  "num-subtasks": number;
  tags: { id: string; name: string; color: string }[];
  "responsible-party-names": string;
}

export async function getInitiativeTasks(): Promise<TWTask[]> {
  const data = await tw<{ "todo-items": TWTask[] }>(
    `/tasklists/${LIST_IDS.initiatives}/tasks.json?includeCompletedTasks=false&nestSubTasks=false`
  );
  return data["todo-items"] ?? [];
}

export async function getTaskSubtasks(taskId: string): Promise<TWTask[]> {
  const data = await tw<{ "todo-items": TWTask[] }>(
    `/tasks/${taskId}/subtasks.json?includeCompletedTasks=false`
  );
  return data["todo-items"] ?? [];
}

export async function getProjectTasks(): Promise<TWTask[]> {
  const data = await tw<{ "todo-items": TWTask[] }>(
    `/projects/${PROJECT_ID}/tasks.json?includeCompletedTasks=false&nestSubTasks=false`
  );
  return data["todo-items"] ?? [];
}

export async function getCompletedTasks(daysBack = 7): Promise<TWTask[]> {
  const since = new Date(Date.now() - daysBack * 86400000)
    .toISOString()
    .split("T")[0]
    .replace(/-/g, "");
  const data = await tw<{ "todo-items": TWTask[] }>(
    `/projects/${PROJECT_ID}/tasks.json?includeCompletedTasks=true&completedAfterDate=${since}&filterType=completed`
  );
  return (data["todo-items"] ?? []).filter((t) => t.completed);
}

export async function completeTask(taskId: string): Promise<void> {
  await tw(`/tasks/${taskId}/complete.json`, { method: "PUT" });
}

export async function createSubtask(
  parentTaskId: string,
  content: string,
  dueDate?: string
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    "todo-item": { content, "parent-task-id": parentTaskId },
  };
  if (dueDate) body["todo-item"] = { ...body["todo-item"] as object, "due-date": dueDate };
  const data = await tw<{ id: string }>(`/tasks.json`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: data.id };
}

export async function moveTaskToList(taskId: string, list: TaskList): Promise<void> {
  await tw(`/tasks/${taskId}.json`, {
    method: "PUT",
    body: JSON.stringify({ "todo-item": { "todo-list-id": LIST_IDS[list] } }),
  });
}

export async function createTask(content: string, list: TaskList, dueDate?: string): Promise<{ id: string }> {
  const item: Record<string, unknown> = {
    content,
    "responsible-party-id": process.env.TEAMWORK_USER_ID ?? "",
  };
  if (dueDate) item["due-date"] = dueDate;
  const data = await tw<{ id: string }>(`/tasklists/${LIST_IDS[list]}/tasks.json`, {
    method: "POST",
    body: JSON.stringify({ "todo-item": item }),
  });
  return { id: data.id };
}

export { LIST_IDS, PROJECT_ID };
