import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { getStudentSession } from "@/lib/student-session";
import { UPLOAD_PURPOSES, signUpload, type UploadPurpose } from "@/lib/cloudinary-server";

/** Who may upload what: admins manage avatars, manuals and branding; students upload their own avatar and evidence. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { purpose?: unknown } | null;
  const purpose = (body?.purpose ?? "avatar") as UploadPurpose;
  if (!UPLOAD_PURPOSES.includes(purpose)) return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });

  const isAdmin = !!(await getAdminUserId());
  let allowed = isAdmin && purpose !== "evidence";
  if (!allowed && (purpose === "avatar" || purpose === "evidence")) allowed = !!(await getStudentSession());
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(signUpload(purpose));
  } catch {
    return NextResponse.json({ error: "Image uploads are not configured" }, { status: 500 });
  }
}
