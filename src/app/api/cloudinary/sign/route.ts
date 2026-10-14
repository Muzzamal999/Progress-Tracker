import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { signUpload } from "@/lib/cloudinary-server";

export async function POST() {
  if (!(await getAdminUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(signUpload());
  } catch {
    return NextResponse.json({ error: "Image uploads are not configured" }, { status: 500 });
  }
}
