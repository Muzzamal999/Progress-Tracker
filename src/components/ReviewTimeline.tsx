import { describeEvent, eventTime, type ReviewEvent } from "@/lib/review-history";

/** Submission and review history (oldest first). Server-renderable. */
export function ReviewTimeline({ events, label = "History", actors, open = false }: { events: ReviewEvent[]; label?: string; actors?: Record<string, string>; open?: boolean }) {
  if (events.length === 0) return null;
  return (
    <details open={open} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-medium">{label} ({events.length})</summary>
      <ol className="mt-2 space-y-2 border-l border-border pl-4">
        {events.map((e) => (
          <li key={e.id}>
            <p className="font-medium">{describeEvent(e)}</p>
            <p className="text-xs text-muted-foreground">{eventTime(e)}{actors && e.actor ? ` · by ${actors[e.actor] ?? "an administrator"}` : ""}</p>
            {e.feedback && <p className="mt-0.5 rounded bg-secondary px-2 py-1">{e.feedback}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
