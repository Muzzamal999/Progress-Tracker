import { cn } from "@/lib/utils";

/** Navy brand band used at the top of inner pages. */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden bg-brand text-navy-foreground", className)}>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20">
        {eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-300">{eyebrow}</p>}
        <h1 className="max-w-3xl text-4xl font-extrabold text-white md:text-5xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-lg text-navy-muted">{description}</p>}
        {children}
      </div>
    </section>
  );
}
