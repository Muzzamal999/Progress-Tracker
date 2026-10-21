"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPkt, formatRemaining } from "@/lib/time";
import { windowState, KIND_LABEL, type DeadlineKind, type WindowState } from "@/lib/deadlines";

/** One row of public.my_deadlines(). */
export interface MyWindow {
  kind: DeadlineKind;
  task_id: string | null;
  deadline_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  state: WindowState;
  configured: boolean;
  extended: boolean;
  server_now: string;
}

export const EXPIRED_MESSAGE = "Submission deadline has expired. Contact your administrator if an extension is required.";

/**
 * "Now" anchored to the SERVER's clock: the server time delivered with the page is the starting point and only
 * the time elapsed since the page arrived is measured locally, so a wrong or tampered device clock cannot move a
 * countdown. This is display only; the database enforces every window on its own.
 */
export function useServerNow(serverNowIso: string | undefined, tickMs = 1000): number {
  const base = serverNowIso ? new Date(serverNowIso).getTime() : 0;
  const [tick, setTick] = useState({ key: serverNowIso, elapsed: 0 });
  useEffect(() => {
    if (!serverNowIso) return;
    const anchor = Date.now();
    const t = setInterval(() => setTick({ key: serverNowIso, elapsed: Date.now() - anchor }), tickMs);
    return () => clearInterval(t);
  }, [serverNowIso, tickMs]);
  // A refreshed page brings a new server time: ignore elapsed time measured against the old one.
  return base + (tick.key === serverNowIso ? tick.elapsed : 0);
}

/** The window for a kind (and optionally one task: a task-specific window beats the generic one). */
export function pickWindow(windows: MyWindow[], kind: DeadlineKind, taskId: string | null = null): MyWindow | undefined {
  return (taskId ? windows.find((w) => w.kind === kind && w.task_id === taskId) : undefined) ?? windows.find((w) => w.kind === kind && w.task_id === null);
}

/** Live state of a window: open/scheduled/closed re-evaluated every second against the server-anchored clock. */
export function liveState(w: MyWindow | undefined, now: number): WindowState {
  if (!w) return "open"; // unknown: let the server decide (it always enforces)
  if (!w.configured || !w.opens_at || !w.closes_at) return w.state;
  return windowState(w.opens_at, w.closes_at, now);
}

export function lockedReason(w: MyWindow | undefined, state: WindowState): string | null {
  if (state === "open") return null;
  if (state === "scheduled") return `Submissions are not open yet. They open on ${w?.opens_at ? formatPkt(w.opens_at) : "a date to be announced"}.`;
  return w?.configured ? EXPIRED_MESSAGE : "Submissions are currently closed. Contact your administrator.";
}

/** Banner with a live countdown. Refreshes the page when the window opens or closes so the UI flips on its own. */
export function WindowBanner({ w, label, compact = false }: { w: MyWindow | undefined; label: string; compact?: boolean }) {
  const router = useRouter();
  const now = useServerNow(w?.server_now);
  const state = liveState(w, now);
  const initial = w?.state;

  useEffect(() => {
    if (w && state !== initial) router.refresh();
  }, [state, initial, router, w]);

  const locked = state !== "open";
  const Icon = locked ? Lock : Unlock;
  const tone = locked ? "border-red-500/40 bg-red-500/10" : w?.configured ? "border-green-500/40 bg-green-500/10" : "border-border bg-card";
  let detail: React.ReactNode;
  if (state === "open" && w?.configured && w.closes_at) {
    const left = new Date(w.closes_at).getTime() - now;
    detail = (
      <>
        Closes {formatPkt(w.closes_at)}
        {w.extended ? " (extended for you)" : ""}. Time left:{" "}
        <strong className={cn("tabular-nums", left < 3600_000 && "text-red-600 dark:text-red-400")}>{formatRemaining(left)}</strong>
      </>
    );
  } else if (state === "open") {
    detail = "No deadline has been set, so submissions are open.";
  } else if (state === "scheduled" && w?.opens_at) {
    detail = (
      <>
        Opens {formatPkt(w.opens_at)}. Opens in <strong className="tabular-nums">{formatRemaining(new Date(w.opens_at).getTime() - now)}</strong>.
      </>
    );
  } else {
    detail = lockedReason(w, state);
  }
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", tone, compact && "p-2.5")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">
          {label}: {locked ? (state === "scheduled" ? "not open yet" : "locked") : "open"}
        </p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Dashboard card: every window in one place. */
export function WindowsSummary({ windows, taskTitles = {} }: { windows: MyWindow[]; taskTitles?: Record<string, string> }) {
  const generic = (["project", "task", "daily_report", "lab_report"] as DeadlineKind[]).map((k) => pickWindow(windows, k));
  const specific = windows.filter((w) => w.task_id);
  if (windows.length === 0) return null;
  return (
    <section aria-labelledby="windows-h" className="space-y-3">
      <h2 id="windows-h" className="flex items-center gap-2 text-xl font-bold">
        <CalendarClock className="h-5 w-5" aria-hidden="true" /> Submission deadlines
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {generic.map((w, i) => (w ? <WindowBanner key={i} w={w} label={KIND_LABEL[w.kind]} compact /> : null))}
        {specific.map((w) => (
          <WindowBanner key={`${w.kind}-${w.task_id}`} w={w} label={`Task: ${taskTitles[w.task_id as string] ?? "assigned task"}`} compact />
        ))}
      </div>
    </section>
  );
}
