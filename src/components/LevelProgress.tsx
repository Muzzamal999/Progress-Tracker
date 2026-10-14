import { BADGE_ORDER, type BadgeLevel } from "@/lib/types";
import { badgeRank } from "@/lib/badges";
import { cn } from "@/lib/utils";

/** 10-step bar showing how far up the badge ladder a student is (derived from their real badge). */
export function LevelProgress({ level, compact = false, className }: { level: BadgeLevel; compact?: boolean; className?: string }) {
  const rank = badgeRank(level) + 1;
  return (
    <div className={className}>
      {!compact && (
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Level progress</span>
          <span>
            Level {rank} of {BADGE_ORDER.length}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={`${level} badge, level ${rank} of ${BADGE_ORDER.length}`}
        aria-valuemin={0}
        aria-valuemax={BADGE_ORDER.length}
        aria-valuenow={rank}
        className="flex gap-1"
      >
        {BADGE_ORDER.map((b, i) => (
          <span key={b} className={cn("h-1.5 flex-1 rounded-full", i < rank ? "bg-accent-gradient" : "bg-border")} />
        ))}
      </div>
    </div>
  );
}
