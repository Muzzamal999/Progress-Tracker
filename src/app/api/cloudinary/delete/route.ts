import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { destroyImage } from "@/lib/cloudinary-server";

export async function POST(request: Request) {
  if (!(await getAdminUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { publicId?: unknown } | null;
  if (!body || typeof body.publicId !== "string" || !body.publicId) {
    return NextResponse.json({ error: "publicId is required" }, { status: 400 });
  }
  // destroyImage refuses anything outside our upload folder.
  await destroyImage(body.publicId);
  return NextResponse.json({ ok: true });
}
