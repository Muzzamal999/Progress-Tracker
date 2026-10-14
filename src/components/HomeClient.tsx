"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, Search, SearchX } from "lucide-react";
import { BadgeLegendList } from "@/components/BadgeLegend";
import { JourneyCard } from "@/components/JourneyCard";
import { StudentCard } from "@/components/StudentCard";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { badgeRank } from "@/lib/badges";
import { availableBadges, availableTracks, filterAndSort, isSortKey, type Filters } from "@/lib/student-utils";
import type { Student } from "@/lib/types";

const ALL = "all";

export function HomeClient({ students }: { students: Student[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the URL (?q=&track=&badge=&sort=) so back / refresh keep them.
  const sortParam = params.get("sort");
  const filters: Filters = {
    q: params.get("q") ?? "",
    track: params.get("track") ?? "",
    badge: params.get("badge") ?? "",
    sort: isSortKey(sortParam) ? sortParam : "name",
  };
  // The search box keeps its own text so typing never lags behind the URL update.
  const [search, setSearch] = useState(filters.q);

  const tracks = useMemo(() => availableTracks(students), [students]);
  const badges = useMemo(() => availableBadges(students), [students]);
  const visible = useMemo(() => filterAndSort(students, { ...filters, q: search }), [students, filters.track, filters.badge, filters.sort, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real figures only, computed from the data.
  const projectTotal = useMemo(() => students.reduce((n, s) => n + s.projects.length, 0), [students]);
  const featured = useMemo(
    () => [...students].sort((a, b) => badgeRank(b.badge) - badgeRank(a.badge) || a.name.localeCompare(b.name))[0] ?? null,
    [students],
  );

  function update(patch: Partial<Filters>) {
    const next = { ...filters, q: search, ...patch };
    const sp = new URLSearchParams();
    if (next.q.trim()) sp.set("q", next.q);
    if (next.track) sp.set("track", next.track);
    if (next.badge) sp.set("badge", next.badge);
    if (next.sort !== "name") sp.set("sort", next.sort);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const active = !!(search.trim() || filters.track || filters.badge);
  function clear() {
    setSearch("");
    router.replace(pathname, { scroll: false });
  }

  return (
    <>
      <section className="relative overflow-hidden bg-brand text-navy-foreground">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "48px 48px" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-rise space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> Progress board for learners
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-6xl">
              Every student&apos;s journey, from <span className="text-accent-gradient">Bronze to Legend</span>.
            </h1>
            <p className="max-w-xl text-lg text-navy-muted">
              Follow progress, skills and projects across tracks, and see exactly what it takes to reach the next badge.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-accent-gradient shadow-lg shadow-primary/30 hover:opacity-90">
                <Link href="#students">
                  Browse students <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <Link href="/badges">Explore the badge system</Link>
              </Button>
            </div>
            <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
              <div>
                <dd className="text-3xl font-extrabold text-white">{students.length}</dd>
                <dt className="text-sm text-navy-muted">{students.length === 1 ? "Student" : "Students"}</dt>
              </div>
              <div>
                <dd className="text-3xl font-extrabold text-white">{projectTotal}</dd>
                <dt className="text-sm text-navy-muted">{projectTotal === 1 ? "Project" : "Projects"}</dt>
              </div>
              <div>
                <dd className="text-3xl font-extrabold text-white">{tracks.length}</dd>
                <dt className="text-sm text-navy-muted">{tracks.length === 1 ? "Track" : "Tracks"}</dt>
              </div>
            </dl>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <JourneyCard featured={featured} />
          </div>
        </div>
      </section>

      <section id="students" className="mx-auto max-w-7xl scroll-mt-20 space-y-8 px-4 py-14 sm:px-6">
        <div>
          <h2 className="text-3xl font-extrabold">Students</h2>
          <p className="mt-2 text-muted-foreground">Search by name or skill, or narrow down by track and badge.</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search by name or skill"
                placeholder="Search name or skill..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  update({ q: e.target.value });
                }}
              />
            </div>
            <Select value={filters.track || ALL} onValueChange={(v) => update({ track: v === ALL ? "" : v })}>
              <SelectTrigger aria-label="Filter by track">
                <SelectValue placeholder="All tracks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tracks</SelectItem>
                {tracks.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.badge || ALL} onValueChange={(v) => update({ badge: v === ALL ? "" : v })}>
              <SelectTrigger aria-label="Filter by badge">
                <SelectValue placeholder="All badges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All badges</SelectItem>
                {badges.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.sort} onValueChange={(v) => isSortKey(v) && update({ sort: v })}>
              <SelectTrigger aria-label="Sort students">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name (A–Z)</SelectItem>
                <SelectItem value="badge">Badge (highest first)</SelectItem>
                <SelectItem value="track">Track (A–Z)</SelectItem>
                <SelectItem value="projects">Projects (most first)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted-foreground">
            <span aria-live="polite">
              Showing {visible.length} of {students.length} students
            </span>
            {active && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {/* Phones: collapsible legend above the grid. */}
        <Collapsible className="sm:hidden">
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-(--shadow-card)">
            Badge system
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="rounded-b-xl border border-t-0 border-border bg-card p-4">
            <BadgeLegendList />
          </CollapsibleContent>
        </Collapsible>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
          <aside className="hidden sm:col-span-1 sm:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
              <h2 className="mb-4 text-base font-bold">Badge legend</h2>
              <BadgeLegendList />
            </div>
          </aside>

          <section className="sm:col-span-3" aria-label="Students">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <SearchX className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="text-xl font-bold">No students found</h3>
                <p className="text-muted-foreground">Try a different search or remove some filters.</p>
                <Button onClick={clear}>Clear all filters</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((s) => (
                  <StudentCard key={s.id} student={s} />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
