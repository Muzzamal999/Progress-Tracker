import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { ProfileForm } from "@/components/student/ProfileForm";

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
  return (
    <div>
      <h1 className="text-2xl font-extrabold">My profile</h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        {student.profile_completed_at ? "Keep your details up to date." : "Complete your profile to enrol. You can submit work as soon as you are enrolled in an open batch."}
      </p>
      <ProfileForm
        initial={{ name: student.name, track: student.track, batchId: student.batch_id, bio: student.bio ?? "", skills: student.skills, imageUrl: student.image_url }}
        batches={options}
      />
    </div>
  );
}
