import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listAdminStudents } from "@/lib/admin-data";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { DashboardCards } from "@/components/admin/DashboardCards";
import { getDashboardData } from "@/lib/admin-queries";

// Load errors bubble up to the segment's error.tsx (an error boundary with a retry button).
export default async function AdminPage() {
  const supabase = await createClient();
  const [students, subs, reps, dash] = await Promise.all([
    listAdminStudents(),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("daily_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    getDashboardData(supabase),
  ]);
  const pending = (subs.count ?? 0) + (reps.count ?? 0);
  return (
    <div className="space-y-6">
      {pending > 0 && (
        <Link href="/admin/review" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 hover:bg-primary/15">
          <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-medium">{pending} item{pending === 1 ? "" : "s"} waiting for your review</span>
        </Link>
      )}
      <DashboardCards d={dash} />
      <AdminDashboard initialStudents={students} />
    </div>
  );
}
