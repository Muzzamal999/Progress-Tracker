import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrg } from "@/lib/org";
import { renderCertificatePdf } from "@/lib/certificate-pdf";
import type { CertificateRow } from "@/lib/workflow-types";

/** Downloads a certificate PDF. RLS means only the owner or an admin can read the certificate row. */
export async function GET(request: Request, ctx: { params: Promise<{ number: string }> }) {
  const { number } = await ctx.params;
  if (!/^CERT-\d{4}-[A-Z0-9]{10}$/.test(number)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { data } = await supabase.from("certificates").select("*").eq("certificate_number", number).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cert = data as CertificateRow;
  if (cert.revoked_at) return NextResponse.json({ error: "This certificate has been revoked" }, { status: 410 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const pdf = await renderCertificatePdf(cert, await getOrg(), `${origin}/verify/${cert.certificate_number}`);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.certificate_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
