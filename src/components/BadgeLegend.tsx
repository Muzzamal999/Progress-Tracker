import { BADGE_ORDER } from "@/lib/types";
import { LEGEND_DESCRIPTIONS } from "@/lib/badges";
import { Badge } from "@/components/Badge";

export function BadgeLegendList() {
  return (
    <ol className="space-y-3">
      {BADGE_ORDER.map((level, i) => (
        <li key={level} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
            {i + 1}
          </span>
          <div className="space-y-1">
            <Badge level={level} size="sm" />
            <p className="text-xs leading-snug text-muted-foreground">{LEGEND_DESCRIPTIONS[level]}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
