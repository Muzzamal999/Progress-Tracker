import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { AdminProviders } from "@/components/admin/AdminProviders";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

async function Shell({ children }: { children: React.ReactNode }) {
  // Authoritative server-side check (the proxy is only the first gate).
  const admin = await requireAdminPage();
  return (
    <AdminProviders>
      <AdminSidebar email={admin.email} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        {children}
      </main>
    </AdminProviders>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <Shell>{children}</Shell>
      </Suspense>
    </div>
  );
}
