import type { Metadata } from "next";
import { ArrowRight, Lightbulb, Target } from "lucide-react";
import { Badge } from "@/components/Badge";
import { BadgeLegendList } from "@/components/BadgeLegend";
import { PageHero } from "@/components/PageHero";
import { TIPS } from "@/lib/tips";

export const metadata: Metadata = {
  title: "Tips & Tricks",
  description: "Practical guides for levelling up from Bronze all the way to Legend.",
};

export default function TipsPage() {
  return (
    <>
      <PageHero
        eyebrow="Tips & tricks"
        title={
          <>
            How to reach the <span className="text-accent-gradient">next badge</span>
          </>
        }
        description="Nine guides, one for every step up the ladder."
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-14 sm:px-6 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card) lg:sticky lg:top-24">
            <h2 className="mb-4 text-base font-bold">Badge legend</h2>
            <BadgeLegendList />
          </div>
        </aside>

        <div className="space-y-6 lg:col-span-3">
          {TIPS.map((t) => (
            <article key={`${t.from}-${t.to}`} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge level={t.from} size="sm" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-label="to" />
                <Badge level={t.to} size="sm" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t.title}</h2>
                <p className="mt-1 text-muted-foreground">{t.description}</p>
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Target className="h-4 w-4 text-primary" aria-hidden="true" /> Action Steps
                </h3>
                <ul className="space-y-2">
                  {t.steps.map((s) => (
                    <li key={s} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-bold">Key Focus Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {t.focus.map((f) => (
                    <span key={f} className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
