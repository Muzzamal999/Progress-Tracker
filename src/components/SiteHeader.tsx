"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, X } from "lucide-react";
import { SiteLogo } from "@/components/SiteLogo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Students" },
  { href: "/badges", label: "Badge System" },
  { href: "/tips", label: "Tips & Tricks" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/student") : pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  // The menu is "open for" a path, so it closes automatically after navigating.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-navy-border bg-midnight/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <SiteLogo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(pathname, l.href) ? "bg-white/10 text-white" : "text-navy-muted hover:bg-white/5 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="hidden items-center gap-1.5 rounded-lg border border-navy-border px-3.5 py-2 text-sm font-medium text-navy-foreground transition-colors hover:border-white/30 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpenFor(open ? null : pathname)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="animate-rise border-t border-navy-border bg-midnight px-4 pb-4 pt-2 md:hidden">
          <ul className="space-y-1">
            {[...LINKS, { href: "/admin", label: "Admin" }].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(pathname, l.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-3 text-base font-medium",
                    isActive(pathname, l.href) ? "bg-white/10 text-white" : "text-navy-muted hover:bg-white/5 hover:text-white",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
