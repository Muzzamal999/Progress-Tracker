import { listSkillSuggestions } from "@/lib/admin-data";
import { StudentForm } from "@/components/admin/StudentForm";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const skills = await listSkillSuggestions();
  return <StudentForm skillSuggestions={skills} />;
}
