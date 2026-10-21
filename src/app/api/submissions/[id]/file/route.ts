import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Attachment, PdfDoc } from "@/lib/workflow-types";

/**
 * Authenticated access to a submission's evidence images and lab-report PDF.
 * The submission row is read through the caller's session, so RLS decides: only the owner or an admin gets a
 * file. We stream it from Cloudinary ourselves (inline preview or forced download) instead of handing out the
 * raw storage URL, and only ever fetch from our own Cloudinary cloud.
 *   GET /api/submissions/<id>/file?which=lab            -> lab report PDF
 *   GET /api/submissions/<id>/file?which=0..5           -> evidence image n
 *   add &download=1 to force a download
 */
const q = z.object({ which: z.string().regex(/^(lab|[0-5])$/), download: z.enum(["0", "1"]).default("0") });
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = q.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { data: row } = await supabase.from("submissions").select("title, attachments, lab_report").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 }); // also what a non-owner sees: RLS hides the row

  const { which, download } = parsed.data;
  let url: string | undefined;
  let name: string;
  if (which === "lab") {
    const pdf = row.lab_report as PdfDoc | null;
    url = pdf?.url;
    name = pdf?.name || "lab-report.pdf";
  } else {
    const a = (row.attachments as Attachment[])[Number(which)];
    url = a?.url;
    name = `${row.title}-evidence-${Number(which) + 1}`.replace(/[^\w.-]+/g, "_");
  }
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!url || !cloud || !url.startsWith(`https://res.cloudinary.com/${cloud}/`)) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch((e) => {
    console.error("submission file fetch failed", e);
    return null;
  });
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "The file could not be retrieved" }, { status: 502 });
  if (Number(upstream.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const type = which === "lab" ? "application/pdf" : (upstream.headers.get("content-type") ?? "application/octet-stream");
  if (which !== "lab" && !type.startsWith("image/")) return NextResponse.json({ error: "Unsupported file" }, { status: 415 });
  const ext = which === "lab" ? "" : `.${type.split("/")[1]?.replace("jpeg", "jpg") ?? "img"}`;
  const filename = (which === "lab" && !/\.pdf$/i.test(name) ? `${name}.pdf` : name + ext).replace(/"/g, "");
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${download === "1" ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Images are sandboxed; a PDF needs the browser's own viewer, which a sandbox CSP would block.
      ...(which === "lab" ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
    },
  });
}
