import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { ProfileForm } from "@/components/student/ProfileForm";
import { StudentAvatar } from "@/components/StudentAvatar";
import { Lock } from "lucide-react";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const { student } = await requireStudentPage();
  const supabase = await createClient();
  const [{ data: batches }, { data: classes }] = await Promise.all([
    supabase.from("batches").select("id, name, class_id").eq("is_active", true).order("name"),
    supabase.from("classes").select("id, name").eq("is_active", true),
  ]);
  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const options = (batches ?? []).filter((b) => className.has(b.class_id)).map((b) => ({ id: b.id, label: `${className.get(b.class_id)} · ${b.name}` }));
  if (student.profile_completed_at) {
    const batch = options.find((o) => o.id === student.batch_id)?.label;
    const rows: [string, string][] = [["Full name", student.name], ["Track", student.track], ["Batch", batch ?? "-"], ["Skills", student.skills.join(", ") || "-"], ["About you", student.bio || "-"]];
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold">My profile</h1>
        <p className="mb-6 mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="h-4 w-4" aria-hidden="true" /> Your profile is locked. Contact an administrator if something must change.</p>
        <div className="mb-6 flex items-center gap-4"><StudentAvatar name={student.name} imageUrl={student.image_url} size={96} /><p className="text-lg font-bold">{student.name}</p></div>
        <dl className="divide-y divide-border rounded-2xl border border-border bg-card shadow-(--shadow-card)">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-sm font-medium text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap text-sm">{v}</dd></div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-2xl font-extrabold">My profile</h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        Complete your profile to enrol. You can submit work as soon as you are enrolled in an open batch. Once saved, your profile is locked.
      </p>
      <ProfileForm
        initial={{ name: student.name, track: student.track, batchId: student.batch_id, bio: student.bio ?? "", skills: student.skills, imageUrl: student.image_url }}
        batches={options}
      />
    </div>
  );
}
