import { Lock } from "lucide-react";
import { BADGE_CONFIG } from "@/components/Badge";
import type { BadgeProgress } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

const GLOW: Record<string, string> = {
  Bronze: "#e8a96a", Silver: "#dfe3e8", Gold: "#fbbf24", Platinum: "#cfd8dc", Diamond: "#7dd3fc",
  Obsidian: "#9ca3af", Crystal: "#e879f9", Titanium: "#94a3b8", Master: "#fb923c", Legend: "#a855f7",
};

/** 0 = dim/locked, 1 = subtle glow, 2 = stronger glow, 3 = full glow + completion animation. */
export function glowLevel(p: Pick<BadgeProgress, "state" | "counted" | "percent">): 0 | 1 | 2 | 3 {
  if (p.state === "completed") return 3;
  if (p.counted <= 0) return 0;
  return p.percent < 50 ? 1 : 2;
}

export function BadgeMedal({ badge, size = 88 }: { badge: BadgeProgress; size?: number }) {
  const cfg = BADGE_CONFIG[badge.level];
  const Icon = cfg.icon;
  const glow = glowLevel(badge);
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size, ["--badge-glow" as string]: GLOW[badge.level] }}
      role="img"
      aria-label={`${badge.name}: ${badge.counted} of ${badge.required} approved projects, ${badge.percent}%${badge.state === "locked" ? ", locked" : ""}`}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          stroke={GLOW[badge.level]} strokeDasharray={circ} strokeDashoffset={circ * (1 - badge.percent / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div
        className={cn(
          "absolute inset-2.5 flex items-center justify-center rounded-full ring-1 ring-black/10",
          cfg.gradient, cfg.text,
          glow === 0 && "badge-locked", glow === 1 && "badge-glow-1", glow === 2 && "badge-glow-2", glow === 3 && "badge-glow-3",
        )}
      >
        {badge.state === "locked" ? <Lock className="h-1/3 w-1/3" aria-hidden="true" /> : <Icon className="h-1/2 w-1/2" aria-hidden="true" />}
      </div>
    </div>
  );
}
