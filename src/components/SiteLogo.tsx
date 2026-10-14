import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-accent-gradient shadow-lg shadow-primary/30", className)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
      </svg>
    </span>
  );
}

export function SiteLogo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <LogoMark />
      <span className={cn("font-[family-name:var(--font-heading)] text-base font-bold tracking-tight", tone === "dark" ? "text-navy-foreground" : "text-foreground")}>
        Student Journey <span className="text-accent-gradient">Atlas</span>
      </span>
    </Link>
  );
}
