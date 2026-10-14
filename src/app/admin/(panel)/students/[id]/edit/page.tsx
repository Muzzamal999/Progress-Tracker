import { notFound } from "next/navigation";
import { z } from "zod";
import { getAdminStudent, listSkillSuggestions } from "@/lib/admin-data";
import { StudentForm } from "@/components/admin/StudentForm";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/admin/students/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [student, skills] = await Promise.all([getAdminStudent(id), listSkillSuggestions()]);
  if (!student) notFound();
  return <StudentForm student={student} skillSuggestions={skills} />;
}
