"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockType = "waiting_client" | "waiting_person" | "external";
type Mode = "deep_work" | "get_things_done";
type GtdSort = "speed" | "age";
type View = "home" | "mode" | "loading" | "session" | "reflect" | "settings" | "capture";

type Task = {
  id: string;
  title: string;
  priority_rank: number;
  strategic_tier: string;
  task_type: string;
  reasoning: string;
  estimated_duration: string;
  due_date?: string | null;
  created_on?: string;
  completed?: boolean;
  blocked?: boolean;
  block_type?: BlockType;
  waiting_on?: string;
};

type Subtask = {
  id: string;
  content: string;
  completed: boolean;
  "due-date"?: string;
};

type Flag = {
  id: string;
  title: string;
  flag_type: string;
  note: string;
};

type ReflectData = {
  synthesis: string;
  weekLabel: string;
  totalCompleted: number;
  grouped: { label: string; tasks: string[] }[];
  stillBlocked: { reason: string; waiting_on: string | null; block_type: string }[];
};

type DeltaData = {
  newCount: number;
  overdueCount: number;
  hasSession: boolean;
};

type TierRow = {
  id: string;
  tier_type: "vision" | "annual" | "operational";
  name: string;
  description: string | null;
  year: number | null;
  sort_order: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES: { key: Mode; label: string; sub: string }[] = [
  { key: "deep_work", label: "Deep Work", sub: "Strategic initiatives — what moves the needle" },
  { key: "get_things_done", label: "Get Things Done", sub: "Your full task list, sorted your way" },
];

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTWDate(d: string): Date {
  return new Date(d.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
}

function formatDueLabel(dueDate: string | null | undefined): string {
  if (!dueDate) return "";
  const d = parseTWDate(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sortGTD(tasks: Task[], sort: GtdSort): Task[] {
  return [...tasks].sort((a, b) => {
    if (sort === "speed") {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return parseTWDate(a.due_date).getTime() - parseTWDate(b.due_date).getTime();
    } else {
      if (!a.created_on && !b.created_on) return 0;
      if (!a.created_on) return 1;
      if (!b.created_on) return -1;
      return new Date(a.created_on).getTime() - new Date(b.created_on).getTime();
    }
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<Mode | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [briefing, setBriefing] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockingTask, setBlockingTask] = useState<Task | null>(null);
  const [loadingText, setLoadingText] = useState("Reading your priorities…");
  const [reflectData, setReflectData] = useState<ReflectData | null>(null);
  const [delta, setDelta] = useState<DeltaData | null>(null);
  const [settingsTiers, setSettingsTiers] = useState<TierRow[]>([]);
  const [newRockName, setNewRockName] = useState("");
  const [captureInput, setCaptureInput] = useState("");
  const [capturedTasks, setCapturedTasks] = useState<{ id: string; content: string }[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [gtdSort, setGtdSort] = useState<GtdSort>("speed");
  const [selectedInitiative, setSelectedInitiative] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);

  useEffect(() => {
    fetch("/api/delta")
      .then((r) => r.json())
      .then((data: DeltaData) => {
        if (data.hasSession && (data.newCount > 0 || data.overdueCount > 0)) {
          setDelta(data);
        }
      })
      .catch(() => {});
  }, []);

  async function startSession(selectedMode: Mode) {
    setMode(selectedMode);
    setLoadingText(
      selectedMode === "deep_work"
        ? "Ranking your initiatives…"
        : "Loading your tasks…"
    );
    setView("loading");
    setError(null);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Session failed");
      }

      const data = await res.json();
      setBriefing(data.dayBriefing ?? "");
      setTasks(data.tasks);
      setFlags(data.flags ?? []);
      setSessionId(data.sessionId);
      setDelta(null);
      setView("session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setView("home");
    }
  }

  async function completeTask(taskId: string, taskTitle: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t))
    );
    try {
      await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, taskTitle }),
      });
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: false } : t))
      );
    }
  }

  async function blockTask(
    taskId: string,
    blockType: BlockType,
    waitingOn: string,
    followUpDate: string
  ) {
    const res = await fetch(`/api/tasks/${taskId}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        block_type: blockType,
        waiting_on: waitingOn || undefined,
        follow_up_date: followUpDate || undefined,
        sessionId,
      }),
    });
    if (!res.ok) throw new Error("Could not park task");
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, blocked: true, block_type: blockType, waiting_on: waitingOn || undefined }
          : t
      )
    );
    setBlockingTask(null);
  }

  async function selectInitiative(task: Task) {
    setSelectedInitiative(task);
    setSubtasks([]);
    setSubtasksLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`);
      const data = await res.json();
      setSubtasks(data.subtasks ?? []);
    } catch {
      // show empty state
    } finally {
      setSubtasksLoading(false);
    }
  }

  async function loadReflect() {
    setLoadingText("Reflecting on your week…");
    setView("loading");
    try {
      const res = await fetch("/api/reflect");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Reflect failed");
      }
      const data: ReflectData = await res.json();
      setReflectData(data);
      setView("reflect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setView("home");
    }
  }

  async function captureTask() {
    const content = captureInput.trim();
    if (!content || captureLoading) return;
    setCaptureLoading(true);
    setCaptureInput("");
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCapturedTasks((prev) => [{ id: data.id, content: data.content }, ...prev]);
    } catch {
      setCaptureInput(content);
    } finally {
      setCaptureLoading(false);
    }
  }

  function openCapture() {
    setCaptureInput("");
    setCapturedTasks([]);
    setView("capture");
  }

  async function loadSettings() {
    try {
      const res = await fetch("/api/tiers");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettingsTiers(data.tiers as TierRow[]);
    } catch {
      // show empty state
    }
    setView("settings");
  }

  async function addRock() {
    const name = newRockName.trim();
    if (!name) return;
    setNewRockName("");
    const year = new Date().getFullYear();
    const res = await fetch("/api/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier_type: "annual", name, year }),
    });
    if (res.ok) {
      const data = await res.json();
      setSettingsTiers((prev) => [...prev, data.tier as TierRow]);
    }
  }

  async function removeRock(id: string) {
    setSettingsTiers((prev) => prev.filter((t) => t.id !== id));
    await fetch("/api/tiers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const deltaNudge = delta
    ? [
        delta.newCount > 0 ? `${delta.newCount} new` : "",
        delta.overdueCount > 0 ? `${delta.overdueCount} overdue` : "",
      ]
        .filter(Boolean)
        .join(", ") + " since your last session"
    : null;

  const activeTasks = tasks.filter((t) => !t.blocked);
  const parkedTasks = tasks.filter((t) => t.blocked);
  const sortedGTD = mode === "get_things_done" ? sortGTD(activeTasks, gtdSort) : activeTasks;

  return (
    <>
      <main className="min-h-screen flex flex-col">
        <AnimatePresence mode="wait">

          {/* ── Home ──────────────────────────────────────────────────────────── */}
          {view === "home" && (
            <motion.div
              key="home"
              {...fadeUp}
              className="flex flex-col flex-1 items-center justify-center px-6 gap-10"
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-3xl font-semibold tracking-tight">Keel</h1>
                <p className="text-sm text-muted-foreground">{today}</p>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center max-w-xs">{error}</p>
              )}

              <div className="flex flex-col items-center gap-4">
                {deltaNudge && (
                  <p className="text-xs text-amber-600/80 text-center">{deltaNudge}</p>
                )}
                <button
                  onClick={() => setView("mode")}
                  className="px-8 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-80 transition-opacity"
                >
                  Start your day
                </button>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={openCapture}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Capture tasks →
                  </button>
                  <button
                    onClick={loadReflect}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reflect on this week →
                  </button>
                  <button
                    onClick={loadSettings}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Set your must-wins →
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Mode selection ─────────────────────────────────────────────────── */}
          {view === "mode" && (
            <motion.div
              key="mode"
              {...fadeUp}
              className="flex flex-col flex-1 px-6 pt-16 pb-10 gap-8 max-w-lg mx-auto w-full"
            >
              <div>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                  ← back
                </button>
                <h2 className="text-xl font-semibold tracking-tight">
                  What kind of day is it?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Keel will shape your view around your answer.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {MODES.map((m) => (
                  <motion.button
                    key={m.key}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => startSession(m.key)}
                    className="flex flex-col items-start gap-1 px-5 py-4 rounded-xl border border-border bg-card text-left hover:border-foreground/30 hover:bg-accent transition-all"
                  >
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{m.sub}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Loading ───────────────────────────────────────────────────────── */}
          {view === "loading" && (
            <motion.div
              key="loading"
              {...fadeUp}
              className="flex flex-col flex-1 items-center justify-center px-6 gap-4"
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{loadingText}</p>
            </motion.div>
          )}

          {/* ── Session: Deep Work ─────────────────────────────────────────────── */}
          {view === "session" && mode === "deep_work" && (
            <motion.div
              key="session-dw"
              {...fadeUp}
              className="flex flex-col flex-1 max-w-lg mx-auto w-full px-6 pt-12 pb-16 gap-10"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  Deep Work
                </p>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  new session
                </button>
              </div>

              {briefing && (
                <p className="text-sm text-foreground/70 leading-relaxed">{briefing}</p>
              )}

              <div className="flex flex-col gap-6">
                <AnimatePresence>
                  {activeTasks.map((task, index) => (
                    <motion.button
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: task.completed ? 0.3 : 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.08 }}
                      onClick={() => !task.completed && selectInitiative(task)}
                      className={`text-left w-full group ${task.completed ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            completeTask(task.id, task.title);
                          }}
                          disabled={task.completed}
                          className="mt-1.5 w-4 h-4 rounded-full border border-border flex-shrink-0 group-hover:border-foreground/40 transition-colors disabled:cursor-default"
                          aria-label={task.completed ? "Completed" : "Mark complete"}
                        >
                          {task.completed && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="block w-full h-full rounded-full bg-foreground/40"
                            />
                          )}
                        </button>
                        <div className="flex flex-col gap-1">
                          <span
                            className={`text-xl font-light leading-snug transition-all ${
                              task.completed
                                ? "line-through text-muted-foreground"
                                : "text-foreground group-hover:text-foreground/80"
                            }`}
                          >
                            {task.title}
                          </span>
                          {!task.completed && task.reasoning && (
                            <span className="text-xs text-muted-foreground">
                              {task.reasoning}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>

                {activeTasks.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No initiatives in your list. Add tasks to your Initiatives list in Teamwork.
                  </p>
                )}
              </div>

              {flags.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">
                      Watch
                    </p>
                    {flags.map((flag) => (
                      <FlagItem key={flag.id} flag={flag} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── Session: Get Things Done ───────────────────────────────────────── */}
          {view === "session" && mode === "get_things_done" && (
            <motion.div
              key="session-gtd"
              {...fadeUp}
              className="flex flex-col flex-1 max-w-lg mx-auto w-full px-6 pt-12 pb-16 gap-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  Get Things Done
                </p>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  new session
                </button>
              </div>

              {/* Sort toggle */}
              <div className="flex gap-1 self-start">
                {(["speed", "age"] as GtdSort[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setGtdSort(s)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      gtdSort === s
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "speed" ? "Urgent first" : "Oldest first"}
                  </button>
                ))}
              </div>

              <Separator />

              {/* Task list */}
              <div className="flex flex-col gap-0.5">
                <AnimatePresence>
                  {sortedGTD.map((task, index) => (
                    <GTDTaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      onComplete={() => completeTask(task.id, task.title)}
                      onBlock={() => setBlockingTask(task)}
                    />
                  ))}
                </AnimatePresence>

                {sortedGTD.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">
                    No open tasks. Add some to your Keel project in Teamwork.
                  </p>
                )}
              </div>

              {parkedTasks.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
                      Parked
                    </p>
                    {parkedTasks.map((task) => (
                      <ParkedItem key={task.id} task={task} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── Reflect ───────────────────────────────────────────────────────── */}
          {view === "reflect" && reflectData && (
            <motion.div
              key="reflect"
              {...fadeUp}
              className="flex flex-col flex-1 max-w-lg mx-auto w-full px-6 pt-12 pb-16 gap-8"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Reflect</p>
                  <p className="text-sm text-muted-foreground">{reflectData.weekLabel}</p>
                </div>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← home
                </button>
              </div>

              {reflectData.synthesis && (
                <p className="text-sm text-foreground/80 leading-relaxed">{reflectData.synthesis}</p>
              )}

              <Separator />

              <div className="flex flex-col gap-6">
                <div className="flex items-baseline gap-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">
                    Completed this week
                  </p>
                  <span className="text-xs text-muted-foreground">{reflectData.totalCompleted}</span>
                </div>

                {reflectData.totalCompleted === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing logged yet — complete tasks during a session and they&apos;ll appear here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {reflectData.grouped.map((group) => (
                      <div key={group.label} className="flex flex-col gap-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">
                          {group.label} · {group.tasks.length}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {group.tasks.map((title, i) => (
                            <p key={i} className="text-sm text-foreground/80 leading-snug">{title}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {reflectData.stillBlocked.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">
                      Still parked · {reflectData.stillBlocked.length}
                    </p>
                    {reflectData.stillBlocked.map((b, i) => (
                      <div key={i} className="flex flex-col gap-0.5 pl-3 border-l-2 border-amber-300/50">
                        <p className="text-xs font-medium text-muted-foreground">{b.reason}</p>
                        {b.waiting_on && (
                          <p className="text-xs text-amber-600/60">Waiting on {b.waiting_on}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── Capture ───────────────────────────────────────────────────────── */}
          {view === "capture" && (
            <motion.div
              key="capture"
              {...fadeUp}
              className="flex flex-col flex-1 max-w-lg mx-auto w-full px-6 pt-12 pb-16 gap-8"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Capture</p>
                  <p className="text-sm text-muted-foreground">What&apos;s on your plate?</p>
                </div>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← home
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <textarea
                  value={captureInput}
                  onChange={(e) => setCaptureInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      captureTask();
                    }
                  }}
                  placeholder="Type a task and press Enter…"
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-3 rounded-lg border border-border bg-transparent text-sm leading-relaxed focus:outline-none focus:border-foreground/50 transition-colors resize-none"
                />
                <button
                  onClick={captureTask}
                  disabled={!captureInput.trim() || captureLoading}
                  className="self-end px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-medium disabled:opacity-30 hover:opacity-80 transition-opacity"
                >
                  {captureLoading ? "Adding…" : "Add to inbox"}
                </button>
              </div>

              {capturedTasks.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
                      Added · {capturedTasks.length}
                    </p>
                    <AnimatePresence>
                      {capturedTasks.map((t) => (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-3 py-2.5"
                        >
                          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-foreground/30 flex-shrink-0" />
                          <span className="text-sm text-muted-foreground leading-snug">{t.content}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {capturedTasks.length > 0 && (
                <button
                  onClick={() => setView("mode")}
                  className="self-start px-6 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-80 transition-opacity"
                >
                  Start your day →
                </button>
              )}
            </motion.div>
          )}

          {/* ── Settings ──────────────────────────────────────────────────────── */}
          {view === "settings" && (
            <motion.div
              key="settings"
              {...fadeUp}
              className="flex flex-col flex-1 max-w-lg mx-auto w-full px-6 pt-12 pb-16 gap-8"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Strategy</p>
                  <p className="text-sm text-muted-foreground">{new Date().getFullYear()} must-wins</p>
                </div>
                <button
                  onClick={() => setView("home")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← home
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Must-Wins</p>

                {settingsTiers.filter((t) => t.tier_type === "annual").length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No must-wins set yet. Add 3–5 long-term goals that define this year for you.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {settingsTiers
                    .filter((t) => t.tier_type === "annual")
                    .map((tier) => (
                      <div
                        key={tier.id}
                        className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50"
                      >
                        <span className="text-sm text-foreground leading-snug flex-1">{tier.name}</span>
                        <button
                          onClick={() => removeRock(tier.id)}
                          className="text-xs text-muted-foreground/40 hover:text-destructive transition-colors flex-shrink-0"
                          aria-label="Remove rock"
                        >
                          remove
                        </button>
                      </div>
                    ))}
                </div>

                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newRockName}
                    onChange={(e) => setNewRockName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addRock(); }}
                    placeholder="Add a long-term goal…"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:border-foreground/50 transition-colors"
                  />
                  <button
                    onClick={addRock}
                    disabled={!newRockName.trim()}
                    className="px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-30 hover:opacity-80 transition-opacity"
                  >
                    Add
                  </button>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Vision</p>
                {settingsTiers
                  .filter((t) => t.tier_type === "vision")
                  .map((tier) => (
                    <div key={tier.id} className="flex flex-col gap-0.5">
                      <p className="text-sm text-foreground leading-snug">{tier.name}</p>
                      {tier.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{tier.description}</p>
                      )}
                    </div>
                  ))}
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  Operational Categories
                </p>
                <div className="flex flex-wrap gap-2">
                  {settingsTiers
                    .filter((t) => t.tier_type === "operational")
                    .map((tier) => (
                      <Badge key={tier.id} variant="secondary" className="font-normal">
                        {tier.name}
                      </Badge>
                    ))}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Block sheet */}
      <BlockSheet
        task={blockingTask}
        open={blockingTask !== null}
        onOpenChange={(open) => { if (!open) setBlockingTask(null); }}
        onBlock={blockTask}
      />

      {/* Initiative detail sheet (Deep Work) */}
      <InitiativeSheet
        initiative={selectedInitiative}
        subtasks={subtasks}
        loading={subtasksLoading}
        open={selectedInitiative !== null}
        onOpenChange={(open) => { if (!open) setSelectedInitiative(null); }}
        onComplete={(task) => completeTask(task.id, task.title)}
      />
    </>
  );
}

// ── GTD task item ─────────────────────────────────────────────────────────────

function GTDTaskItem({
  task,
  index,
  onComplete,
  onBlock,
}: {
  task: Task;
  index: number;
  onComplete: () => void;
  onBlock: () => void;
}) {
  const dueLabel = formatDueLabel(task.due_date);
  const isOverdue = dueLabel.includes("overdue");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: task.completed ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="flex items-center gap-3 py-2.5 border-b border-border/40 group"
    >
      <button
        onClick={onComplete}
        disabled={task.completed}
        className="w-4 h-4 rounded-full border border-border flex-shrink-0 group-hover:border-foreground/40 transition-colors disabled:cursor-default"
        aria-label={task.completed ? "Completed" : "Mark complete"}
      >
        {task.completed && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="block w-full h-full rounded-full bg-foreground/40"
          />
        )}
      </button>

      <span
        className={`text-sm leading-snug flex-1 min-w-0 ${
          task.completed ? "line-through text-muted-foreground" : "text-foreground"
        }`}
      >
        {task.title}
      </span>

      {dueLabel && !task.completed && (
        <span
          className={`text-xs flex-shrink-0 ${
            isOverdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {dueLabel}
        </span>
      )}

      {!task.completed && (
        <button
          onClick={(e) => { e.stopPropagation(); onBlock(); }}
          className="flex-shrink-0 text-[10px] text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors leading-none opacity-0 group-hover:opacity-100"
          aria-label="Park this task"
        >
          park
        </button>
      )}
    </motion.div>
  );
}

// ── Parked item ───────────────────────────────────────────────────────────────

function ParkedItem({ task }: { task: Task }) {
  const label =
    task.block_type === "external"
      ? "Externally blocked"
      : task.waiting_on
      ? `Waiting on ${task.waiting_on}`
      : task.block_type === "waiting_client"
      ? "Waiting on client"
      : "Waiting";

  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-l-2 border-amber-300/50 pl-3">
      <span className="text-xs font-medium text-muted-foreground">{task.title}</span>
      <span className="text-xs text-amber-600/60">{label}</span>
    </div>
  );
}

// ── Flag item ─────────────────────────────────────────────────────────────────

function FlagItem({ flag }: { flag: Flag }) {
  const colors: Record<string, string> = {
    overdue: "text-destructive",
    due_soon: "text-amber-600",
    stalled: "text-muted-foreground",
  };

  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-l-2 border-border pl-3">
      <span className={`text-xs font-medium ${colors[flag.flag_type] ?? "text-muted-foreground"}`}>
        {flag.title}
      </span>
      <span className="text-xs text-muted-foreground">{flag.note}</span>
    </div>
  );
}

// ── Initiative sheet (Deep Work subtask expansion) ────────────────────────────

function InitiativeSheet({
  initiative,
  subtasks,
  loading,
  open,
  onOpenChange,
  onComplete,
}: {
  initiative: Task | null;
  subtasks: Subtask[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (task: Task) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="px-6 pb-12 pt-8 rounded-t-2xl h-[88vh] overflow-y-auto"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Initiative detail</SheetTitle>
        {initiative && (
          <div className="flex flex-col gap-8 max-w-lg mx-auto">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-light leading-snug flex-1">{initiative.title}</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-1"
              >
                ← back
              </button>
            </div>

            {initiative.reasoning && (
              <p className="text-sm text-muted-foreground leading-relaxed">{initiative.reasoning}</p>
            )}

            <Separator />

            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">
                What needs to happen
              </p>

              {loading && (
                <div className="flex gap-1.5 py-4">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              )}

              {!loading && subtasks.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  No subtasks yet. Break this down in Teamwork.
                </p>
              )}

              {!loading && subtasks.map((subtask, i) => (
                <motion.div
                  key={subtask.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: subtask.completed ? 0.4 : 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className="flex items-start gap-3 py-3 border-b border-border/40"
                >
                  <span
                    className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      subtask.completed ? "bg-foreground/30" : "bg-foreground/60"
                    }`}
                  />
                  <span
                    className={`text-sm leading-snug ${
                      subtask.completed
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {subtask.content}
                  </span>
                </motion.div>
              ))}
            </div>

            {!initiative.completed && (
              <button
                onClick={() => {
                  onComplete(initiative);
                  onOpenChange(false);
                }}
                className="self-start px-6 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-80 transition-opacity"
              >
                Mark complete
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Block sheet ───────────────────────────────────────────────────────────────

const BLOCK_OPTIONS: { key: BlockType; label: string }[] = [
  { key: "waiting_client", label: "Waiting on Client" },
  { key: "waiting_person", label: "Waiting on Someone" },
  { key: "external", label: "Something Else" },
];

function BlockSheet({
  task,
  open,
  onOpenChange,
  onBlock,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlock: (taskId: string, blockType: BlockType, waitingOn: string, followUpDate: string) => Promise<void>;
}) {
  const [blockType, setBlockType] = useState<BlockType | null>(null);
  const [waitingOn, setWaitingOn] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBlockType(null);
      setWaitingOn("");
      setFollowUpDate("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!task || !blockType) return;
    setLoading(true);
    setError(null);
    try {
      await onBlock(task.id, blockType, waitingOn, followUpDate);
    } catch {
      setError("Couldn't park this task. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => onOpenChange(o)}>
      <SheetContent side="bottom" className="px-6 pb-10 pt-6 rounded-t-2xl" showCloseButton={false}>
        <SheetTitle className="sr-only">Park a task</SheetTitle>
        {task && (
          <div className="flex flex-col gap-6 max-w-lg mx-auto">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Parking</p>
              <p className="text-sm font-medium leading-snug">{task.title}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">What&apos;s in the way?</p>
              <div className="flex flex-col gap-2">
                {BLOCK_OPTIONS.map((opt) => (
                  <motion.button
                    key={opt.key}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setBlockType(opt.key)}
                    className={`px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                      blockType === opt.key
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/30 hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {(blockType === "waiting_client" || blockType === "waiting_person") && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Who?</label>
                <input
                  type="text"
                  value={waitingOn}
                  onChange={(e) => setWaitingOn(e.target.value)}
                  placeholder="Name or company"
                  autoFocus
                  className="px-3 py-2.5 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">Follow-up date (optional)</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:border-foreground/50 transition-colors"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => onOpenChange(false)}
                className="flex-1 py-3 rounded-full border border-border text-sm text-muted-foreground hover:border-foreground/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!blockType || loading}
                className="flex-1 py-3 rounded-full bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-80 transition-opacity"
              >
                {loading ? "Parking…" : "Park it"}
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
