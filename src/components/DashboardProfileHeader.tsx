import { Code } from "lucide-react";
import { Badge } from "@/components/Badge";
import { BadgeMedal } from "@/components/BadgeMedal";
import { StudentAvatar } from "@/components/StudentAvatar";
import { trackColor } from "@/lib/student-utils";
import type { BadgeLevel, Track } from "@/lib/types";
import type { BadgeProgress } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

/** GitHub-style profile strip: avatar, name, track and earned/active badges, shown at the top of the dashboard. */
export function DashboardProfileHeader({
  name,
  imageUrl,
  track,
  badge,
  progress,
}: {
  name: string;
  imageUrl: string | null;
  track: Track;
  badge: BadgeLevel | null;
  progress: BadgeProgress[];
}) {
  const earned = progress.filter((b) => b.state !== "locked");

  return (
    <section
      aria-label="Your profile"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card) sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-center gap-4">
        <StudentAvatar name={name} imageUrl={imageUrl} size={72} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold sm:text-2xl">{name}</h1>
          <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", trackColor(track))}>
            <Code className="h-4 w-4" aria-hidden="true" />
            {track}
          </p>
          <div className="mt-2">
            <Badge level={badge} size="sm" />
          </div>
        </div>
      </div>

      {earned.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto sm:justify-end">
          {earned.map((b) => (
            <div key={b.badge_id} title={`${b.name}: ${b.state === "completed" ? "Unlocked" : "In progress"}`}>
              <BadgeMedal badge={b} size={48} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
