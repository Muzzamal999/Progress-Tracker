import Link from "next/link";
import { SiteLogo } from "@/components/SiteLogo";

export function SiteFooter() {
  return (
    <footer className="border-t border-navy-border bg-midnight text-navy-muted">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <SiteLogo />
          <p className="max-w-sm text-sm">Track progress, earn badges, and level up together.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="hover:text-white">Students</Link>
          <Link href="/badges" className="hover:text-white">Badge System</Link>
          <Link href="/tips" className="hover:text-white">Tips &amp; Tricks</Link>
          <Link href="/admin" className="hover:text-white">Admin</Link>
        </nav>
      </div>
    </footer>
  );
}
