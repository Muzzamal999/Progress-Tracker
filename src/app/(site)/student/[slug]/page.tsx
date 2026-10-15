import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Code, ExternalLink, User, Users } from "lucide-react";
import { Badge } from "@/components/Badge";
import { StudentAvatar } from "@/components/StudentAvatar";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { LevelProgress } from "@/components/LevelProgress";
import { getSlugByLegacyId, getStudents, getStudentBySlug } from "@/lib/students";
import { PROJECT_TYPE_CHIP, trackColor } from "@/lib/student-utils";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/student/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const student = await getStudentBySlug(slug);
    if (!student) return { title: "Student not found" };
    const description = `${student.name} – ${student.track} track${student.badge ? `, ${student.badge} badge` : ""} on Student Journey Atlas.`;
    return { title: student.name, description, openGraph: { title: student.name, description } };
  } catch {
    return { title: "Student" };
  }
}

async function Profile({ slug }: { slug: string }) {
  let student;
  let legacySlug: string | null = null;
  try {
    student = await getStudentBySlug(slug);
    // Old shared links used ids like "stu-002": send them to the new slug (308).
    if (!student) legacySlug = await getSlugByLegacyId(slug);
  } catch (e) {
    console.error("Failed to load student", e);
    return (
      <div className="px-4 py-20">
        <ErrorState />
      </div>
    );
  }
  if (legacySlug) permanentRedirect(`/student/${legacySlug}`);
  if (!student) notFound();

  return (
    <>
      <section className="relative overflow-hidden bg-brand text-navy-foreground">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
          <Button asChild variant="ghost" className="-ml-3 text-navy-muted hover:bg-white/10 hover:text-white">
            <Link href="/">
              <ArrowLeft /> All students
            </Link>
          </Button>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-16 max-w-4xl space-y-6 px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <StudentAvatar name={student.name} imageUrl={student.image_url} size={96} />
            <div className="flex-1 space-y-2">
              <h1 className="text-3xl font-extrabold">{student.name}</h1>
              <p className={cn("flex items-center gap-1.5 font-medium", trackColor(student.track))}>
                <Code className="h-4 w-4" aria-hidden="true" />
                {student.track}
              </p>
            </div>
            <Badge level={student.badge} size="lg" className="self-start sm:self-center" />
          </div>
          <LevelProgress level={student.badge} className="mt-6 border-t border-border pt-5" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
            <h2 className="mb-4 text-xl font-bold">Skills</h2>
            {student.skills.length ? (
              <div className="flex flex-wrap gap-2">
                {student.skills.map((s) => (
                  <span key={s} className="rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No skills listed yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
            <h2 className="mb-4 text-xl font-bold">Projects ({student.projects.length})</h2>
            {student.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-border pl-5">
                {student.projects.map((p) => (
                  <li key={p.id} className="relative space-y-2 rounded-xl border border-border bg-background p-4">
                    <span className="absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{p.title}</h3>
                      {p.link && (
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${p.title}`}
                          className="rounded text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded-full border px-2 py-0.5 font-semibold capitalize", PROJECT_TYPE_CHIP[p.type])}>{p.type}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {p.solo ? <User className="h-3 w-3" aria-hidden="true" /> : <Users className="h-3 w-3" aria-hidden="true" />}
                        {p.solo ? "Solo" : "Team"}
                      </span>
                    </div>
                    {p.stack.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.stack.map((t) => (
                          <span key={t} className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export async function generateStaticParams() {
  // Cache Components needs at least one prerendered param, so fall back to a placeholder that 404s.
  try {
    const students = await getStudents();
    if (students.length) return students.map((s) => ({ slug: s.slug }));
  } catch {
    // Supabase unreachable at build time: unknown slugs are still rendered on request.
  }
  return [{ slug: "_" }];
}

export default async function StudentPage({ params }: PageProps<"/student/[slug]">) {
  // Awaited outside <Suspense> on purpose: unknown slugs render on request and return a real 404 status.
  const { slug } = await params;
  return <Profile slug={slug} />;
}
