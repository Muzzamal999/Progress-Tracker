import { listAdminStudents } from "@/lib/admin-data";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

// Load errors bubble up to the segment's error.tsx (an error boundary with a retry button).
export default async function AdminPage() {
  const students = await listAdminStudents();
  return <AdminDashboard initialStudents={students} />;
}
