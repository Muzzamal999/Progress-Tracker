import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/Badge";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { BADGE_DESCRIPTIONS } from "@/lib/badges";

export const metadata: Metadata = {
  title: "Badge System",
  description: "The 10 badge levels, from Bronze to Legend, and what each one requires.",
};

export default function BadgesPage() {
  return (
    <>
      <PageHero
        eyebrow="Badge system"
        title={
          <>
            Ten levels, from your first step to <span className="text-accent-gradient">Legend</span>
          </>
        }
        description="Each badge marks a milestone. Here is what each level asks for."
      />
      <div className="mx-auto max-w-7xl space-y-12 px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {BADGE_DESCRIPTIONS.map((b, i) => (
            <article key={b.level} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-card-hover)">
              <div className="flex items-center justify-between">
                <Badge level={b.level} />
                <span className="text-sm font-semibold text-muted-foreground">Level {i + 1}</span>
              </div>
              <h2 className="text-lg font-bold">
                {i + 1}. {b.title}
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {b.criteria.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <section className="relative overflow-hidden rounded-3xl bg-brand p-8 text-center text-navy-foreground sm:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
          <div className="relative space-y-4">
            <h2 className="text-3xl font-extrabold text-white">Ready to level up?</h2>
            <p className="mx-auto max-w-xl text-navy-muted">See practical guides for moving from one badge to the next.</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button asChild size="lg" className="bg-accent-gradient hover:opacity-90">
                <Link href="/tips">
                  Tips &amp; Tricks <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <Link href="/">Browse students</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
