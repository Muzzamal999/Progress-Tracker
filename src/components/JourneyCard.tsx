import { Badge, BADGE_CONFIG } from "@/components/Badge";
import { LevelProgress } from "@/components/LevelProgress";
import { StudentAvatar } from "@/components/StudentAvatar";
import { badgeRank } from "@/lib/badges";
import { trackColor } from "@/lib/student-utils";
import { BADGE_ORDER, type Student } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Glass card for the hero: the highest-ranked real student plus the 10-step badge ladder. */
export function JourneyCard({ featured }: { featured: Student | null }) {
  const rank = featured ? badgeRank(featured.badge) : -1;
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
      {featured && (
        <div className="mb-6 flex items-center gap-4">
          <StudentAvatar name={featured.name} imageUrl={featured.image_url} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Top of the ladder</p>
            <p className="truncate text-lg font-bold text-white">{featured.name}</p>
            <p className={cn("text-sm font-medium", trackColor(featured.track).replace("600", "300"))}>{featured.track}</p>
          </div>
          <Badge level={featured.badge} size="sm" />
        </div>
      )}
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-navy-muted">The badge ladder</p>
      <ol className="grid grid-cols-5 gap-x-2 gap-y-5" aria-label="Badge levels from Bronze to Legend">
        {BADGE_ORDER.map((level, i) => {
          const cfg = BADGE_CONFIG[level];
          const Icon = cfg.icon;
          const reached = i <= rank;
          return (
            <li key={level} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-white/20 transition-opacity sm:h-12 sm:w-12",
                  cfg.gradient,
                  cfg.text,
                  featured && !reached && "opacity-35",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className={cn("text-[11px] font-medium", reached || !featured ? "text-white" : "text-navy-muted")}>{level}</span>
            </li>
          );
        })}
      </ol>
      {featured && (
        <div className="mt-6 rounded-xl bg-white/5 p-4">
          <LevelProgress level={featured.badge} className="[&_div]:text-navy-muted [&_span.bg-border]:bg-white/15" />
        </div>
      )}
    </div>
  );
}
