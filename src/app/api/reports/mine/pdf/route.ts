import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStudentSession } from "@/lib/student-session";
import { createClient } from "@/lib/supabase/server";
import { loadReportInput } from "@/lib/reports/load";
import { loadLogoPng } from "@/lib/reports/logo";
import { buildDailyModel } from "@/lib/reports/model";
import { renderDailyPdf } from "@/lib/reports/report-pdf";
import { isDateString } from "@/lib/time";

const date = z.string().refine(isDateString, "Invalid date");

/** A student downloads their OWN daily report. Identity comes from the session; the date is the only input. */
export async function GET(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const d = date.safeParse(request.nextUrl.searchParams.get("date"));
  if (!d.success) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const supabase = await createClient();
  try {
    const { input, org } = await loadReportInput(supabase, { from: d.data, to: d.data, mode: "student", studentId: session.student.id });
    for (const st of input.students) if (st.id === session.student.id) st.email = session.email; // student_private is admin-only
    const model = buildDailyModel(input, { kind: "student", id: session.student.id }, d.data);
    if (!model.rows[0]?.report) return NextResponse.json({ error: "You have no report for that date" }, { status: 404 });
    const bytes = await renderDailyPdf(model, {
      org,
      scopeLabel: `Student: ${session.student.name}`,
      generatedAt: new Date(),
      logoPng: await loadLogoPng(org.logo_url),
      showCompliance: false,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="my-daily-report_${d.data}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("own report pdf failed", e);
    return NextResponse.json({ error: "The report could not be generated" }, { status: 500 });
  }
}
