import { Suspense } from "react";
import { requireStudentPage } from "@/lib/student-session";
import { StudentNav } from "@/components/student/StudentNav";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "My dashboard", robots: { index: false, follow: false } };

async function Shell({ children }: { children: React.ReactNode }) {
  const s = await requireStudentPage(); // authoritative server-side check; the proxy is only the first gate
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <StudentNav name={s.student.name} profileDone={!!s.student.profile_completed_at} />
      <div className="mt-8">{children}</div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl space-y-4 px-4 py-10"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
