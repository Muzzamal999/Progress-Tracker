import { Suspense } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* usePathname() inside the header is runtime data on dynamic routes (e.g. /verify/[number]) */}
      <Suspense fallback={<div className="h-16 border-b border-navy-border bg-midnight" aria-hidden="true" />}>
        <SiteHeader />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
