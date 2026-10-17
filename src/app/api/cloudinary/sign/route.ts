import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { getStudentSession } from "@/lib/student-session";
import { UPLOAD_PURPOSES, signUpload, type UploadPurpose } from "@/lib/cloudinary-server";

/** Who may upload what: admins manage avatars, manuals and branding; students upload their own avatar, evidence and lab report PDF. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { purpose?: unknown } | null;
  const purpose = (body?.purpose ?? "avatar") as UploadPurpose;
  if (!UPLOAD_PURPOSES.includes(purpose)) return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });

  const isAdmin = !!(await getAdminUserId());
  let allowed = isAdmin && purpose !== "evidence" && purpose !== "labreport";
  if (!allowed && (purpose === "avatar" || purpose === "evidence" || purpose === "labreport")) allowed = !!(await getStudentSession());
  if (allowed && !isAdmin && purpose === "avatar" && (await getStudentSession())?.student.profile_completed_at) allowed = false; // profile is locked
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(signUpload(purpose));
  } catch {
    return NextResponse.json({ error: "Image uploads are not configured" }, { status: 500 });
  }
}
