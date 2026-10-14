"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LayoutDashboard, Menu, UserPlus, X } from "lucide-react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { LogoMark } from "@/components/SiteLogo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Students", icon: LayoutDashboard, match: (p: string) => p === "/admin" || /^\/admin\/students\/[^/]+\/edit/.test(p) },
  { href: "/admin/students/new", label: "Add student", icon: UserPlus, match: (p: string) => p === "/admin/students/new" },
];

export function AdminSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  // Open "for" a path so the drawer closes itself after navigating.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const panel = (
    <div className="flex h-full flex-col bg-midnight text-navy-foreground">
      <div className="flex h-16 items-center gap-2.5 border-b border-navy-border px-5">
        <LogoMark className="h-8 w-8" />
        <div className="leading-tight">
          <p className="font-[family-name:var(--font-heading)] text-sm font-bold">Student Journey Atlas</p>
          <p className="text-xs text-navy-muted">Admin</p>
        </div>
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-1 p-3">
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-white/10 text-white" : "text-navy-muted hover:bg-white/5 hover:text-white",
              )}
            >
              <n.icon className="h-4 w-4" aria-hidden="true" /> {n.label}
            </Link>
          );
        })}
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-muted hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> View site
        </Link>
      </nav>
      <div className="space-y-3 border-t border-navy-border p-4">
        {email && (
          <p className="truncate text-xs text-navy-muted" title={email}>
            Signed in as <span className="text-white">{email}</span>
          </p>
        )}
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{panel}</aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-navy-border bg-midnight px-4 text-navy-foreground lg:hidden">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-bold">Admin</span>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="admin-drawer"
          onClick={() => setOpenFor(open ? null : pathname)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpenFor(null)} />
          <div id="admin-drawer" className="animate-rise relative h-full w-72 max-w-[85vw]">
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
