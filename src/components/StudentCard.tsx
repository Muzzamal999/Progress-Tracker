import Link from "next/link";
import { Code } from "lucide-react";
import { Badge } from "@/components/Badge";
import { LevelProgress } from "@/components/LevelProgress";
import { StudentAvatar } from "@/components/StudentAvatar";
import { PROJECT_TYPE_CHIP, trackColor } from "@/lib/student-utils";
import { PROJECT_TYPES, type Student } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StudentCard({ student }: { student: Student }) {
  const extra = student.skills.length - 3;
  const n = student.projects.length;
  const mix = PROJECT_TYPES.map((t) => ({ t, count: student.projects.filter((p) => p.type === t).length })).filter((m) => m.count > 0);
  return (
    <Link
      href={`/student/${student.slug}`}
      className="group relative flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-(--shadow-card-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <StudentAvatar name={student.name} imageUrl={student.image_url} size={64} />
        <Badge level={student.badge} size="sm" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold text-foreground">{student.name}</h3>
        <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", trackColor(student.track))}>
          <Code className="h-4 w-4" aria-hidden="true" />
          {student.track}
        </p>
      </div>
      {student.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {student.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {skill}
            </span>
          ))}
          {extra > 0 && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">+{extra}</span>}
        </div>
      )}
      <div className="mt-auto space-y-3">
        <LevelProgress level={student.badge} compact />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {n} {n === 1 ? "project" : "projects"}
          </span>
          {mix.length > 0 && (
            <span className="flex items-center gap-1.5">
              {mix.map((m) => (
                <span key={m.t} title={`${m.count} ${m.t}`} className={cn("rounded-full border px-1.5 py-px text-[11px] font-semibold capitalize", PROJECT_TYPE_CHIP[m.t])}>
                  {m.count} {m.t}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
