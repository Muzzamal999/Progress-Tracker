import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NotAdminError, requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { loadReportInput, scopeLabel } from "@/lib/reports/load";
import { loadLogoPng } from "@/lib/reports/logo";
import { buildDailyModel, buildRangeModel, buildSummaryModel, type Scope } from "@/lib/reports/model";
import { renderDailyPdf, renderRangePdf, renderSummaryPdf } from "@/lib/reports/report-pdf";
import { datesBetween, isDateString, pktDate } from "@/lib/time";

const MAX_DAYS = 92;
const date = z.string().refine(isDateString, "Invalid date");
const query = z
  .object({
    type: z.enum(["daily", "summary", "range"]),
    scope: z.enum(["all", "class", "batch", "student"]).default("all"),
    id: z.uuid().optional(),
    date: date.optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((q) => q.scope === "all" || !!q.id, { message: "Choose a class, batch or student", path: ["id"] });

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Admin-only PDF exports built from live database records (read through the admin's own session, so RLS applies). */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof NotAdminError) return bad("You are not authorized", 403);
    throw e;
  }
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request");
  const q = parsed.data;
  const scope: Scope = q.scope === "all" ? { kind: "all" } : { kind: q.scope, id: q.id as string };

  const from = q.from ?? q.date ?? pktDate();
  const to = q.type === "daily" ? from : (q.to ?? q.date ?? from);
  if (to < from) return bad("The end date is before the start date");
  if (datesBetween(from, to, MAX_DAYS + 1).length > MAX_DAYS) return bad(`Choose a period of at most ${MAX_DAYS} days`);

  const supabase = await createClient();
  try {
    const { input, org } = await loadReportInput(supabase, { from, to, mode: "admin" });
    const ctx = { org, scopeLabel: scopeLabel(scope, input.students), generatedAt: new Date(), logoPng: await loadLogoPng(org.logo_url) };
    let bytes: Uint8Array;
    let name: string;
    if (q.type === "daily") {
      bytes = await renderDailyPdf(buildDailyModel(input, scope, from), ctx);
      name = `daily-report_${from}_${q.scope}`;
    } else if (q.type === "summary") {
      bytes = await renderSummaryPdf(buildSummaryModel(input, scope, from, to), ctx);
      name = `submission-summary_${from}${to === from ? "" : `_to_${to}`}_${q.scope}`;
    } else {
      bytes = await renderRangePdf(buildRangeModel(input, scope, from, to), ctx);
      name = `progress-report_${from}_to_${to}_${q.scope}`;
    }
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("report pdf failed", e);
    return bad("The report could not be generated. Please try again.", 500);
  }
}
