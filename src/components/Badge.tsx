import { Award, Crown, Diamond, Gem, Shield, Sparkles, Star, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BADGE_ORDER, type BadgeLevel } from "@/lib/types";

export const BADGE_CONFIG: Record<BadgeLevel, { icon: LucideIcon; gradient: string; text: string }> = {
  Bronze: { icon: Target, gradient: "bg-gradient-bronze", text: "text-amber-900" },
  Silver: { icon: Star, gradient: "bg-gradient-silver", text: "text-gray-700" },
  Gold: { icon: Award, gradient: "bg-gradient-gold", text: "text-amber-900" },
  Platinum: { icon: Shield, gradient: "bg-gradient-platinum", text: "text-gray-700" },
  Diamond: { icon: Diamond, gradient: "bg-gradient-diamond", text: "text-blue-900" },
  Obsidian: { icon: Zap, gradient: "bg-gradient-obsidian", text: "text-gray-200" },
  Crystal: { icon: Gem, gradient: "bg-gradient-crystal", text: "text-purple-900" },
  Titanium: { icon: Sparkles, gradient: "bg-gradient-titanium", text: "text-slate-200" },
  Master: { icon: Trophy, gradient: "bg-gradient-master", text: "text-orange-900" },
  Legend: { icon: Crown, gradient: "bg-gradient-legend", text: "text-white" },
};

const SIZES = {
  sm: { box: "px-2 py-0.5 text-xs gap-1", icon: "h-3 w-3" },
  md: { box: "px-3 py-1 text-sm gap-1.5", icon: "h-4 w-4" },
  lg: { box: "px-4 py-1.5 text-base gap-2", icon: "h-5 w-5" },
};

export function Badge({ level, size = "md", className }: { level: BadgeLevel | null; size?: keyof typeof SIZES; className?: string }) {
  if (!level) {
    return (
      <span className={cn("inline-flex items-center whitespace-nowrap rounded-full bg-secondary font-semibold tracking-tight text-muted-foreground ring-1 ring-border", SIZES[size].box, className)}>
        No badge yet
      </span>
    );
  }
  // Unknown values (e.g. a level added to the DB but not here) fall back to Bronze instead of crashing.
  const cfg = BADGE_CONFIG[level] ?? BADGE_CONFIG[BADGE_ORDER[0]];
  const Icon = cfg.icon;
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-semibold tracking-tight shadow-sm ring-1 ring-black/10",
        cfg.gradient,
        cfg.text,
        s.box,
        className,
      )}
    >
      <Icon className={s.icon} aria-hidden="true" />
      {level}
    </span>
  );
}
