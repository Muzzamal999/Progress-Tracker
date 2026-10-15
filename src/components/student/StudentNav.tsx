"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/reports", label: "Daily reports" },
  { href: "/dashboard/library", label: "Tasks & manuals" },
];

export function StudentNav({ name, profileDone }: { name: string; profileDone: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="text-lg font-bold">{name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={logout}><LogOut /> Sign out</Button>
      </div>
      <nav aria-label="Student" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-px">
        {TABS.map((t) => {
          const active = t.href === "/dashboard" ? pathname === t.href : pathname.startsWith(t.href);
          const locked = !profileDone && (t.href.endsWith("projects") || t.href.endsWith("reports"));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                locked && "opacity-60",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
