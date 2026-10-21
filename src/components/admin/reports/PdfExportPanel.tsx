"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/textarea";
import type { FilterOptions } from "@/lib/admin-queries";

type ReportType = "daily" | "summary" | "range";
type Audience = "all" | "class" | "batch" | "student";

const TYPES: { id: ReportType; label: string; help: string }[] = [
  { id: "daily", label: "Daily progress report", help: "One date. Per-student details: report, projects, tasks, approvals, badge and deadline compliance." },
  { id: "summary", label: "Daily submission summary", help: "Who submitted a daily report and who is missing, for one date or a period." },
  { id: "range", label: "Date-range progress report", help: "One row per student across a period: reports, projects (approved / pending / rejected), tasks and badge." },
];
const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "All students" },
  { id: "class", label: "A class" },
  { id: "batch", label: "A batch" },
  { id: "student", label: "An individual student" },
];

/**
 * Downloads a PDF built on the server from live records. We fetch it ourselves (instead of navigating) so a
 * validation or permission error appears as a message instead of replacing the page with JSON.
 */
export function PdfExportPanel({ options, today, initial }: { options: FilterOptions; today: string; initial: { date: string; classId: string; batchId: string; studentId: string } }) {
  const [type, setType] = useState<ReportType>("daily");
  const [audience, setAudience] = useState<Audience>(initial.studentId ? "student" : initial.batchId ? "batch" : initial.classId ? "class" : "all");
  const [classId, setClassId] = useState(initial.classId);
  const [batchId, setBatchId] = useState(initial.batchId);
  const [studentId, setStudentId] = useState(initial.studentId);
  const [from, setFrom] = useState(initial.date);
  const [to, setTo] = useState(initial.date);
  const [busy, setBusy] = useState(false);

  const targetId = { all: "", class: classId, batch: batchId, student: studentId }[audience];
  const single = type === "daily";
  const invalid = (audience !== "all" && !targetId) || !from || (!single && (!to || to < from));

  async function download() {
    const q = new URLSearchParams({ type, scope: audience, ...(targetId ? { id: targetId } : {}), ...(single ? { date: from } : { from, to }) });
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reports/pdf?${q}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The report could not be generated");
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "report.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The report could not be generated");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-bold">Download PDF reports</h2>
          <p className="text-sm text-muted-foreground">{TYPES.find((t) => t.id === type)?.help}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field id="x-type" label="Report">
            <NativeSelect id="x-type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </NativeSelect>
          </Field>
          <Field id="x-aud" label="Students">
            <NativeSelect id="x-aud" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </NativeSelect>
          </Field>
          {audience === "class" && (
            <Field id="x-class" label="Class"><NativeSelect id="x-class" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose a class</option>{options.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
          )}
          {audience === "batch" && (
            <Field id="x-batch" label="Batch"><NativeSelect id="x-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}><option value="">Choose a batch</option>{options.batches.map((b) => <option key={b.id} value={b.id}>{b.class_name} / {b.name}</option>)}</NativeSelect></Field>
          )}
          {audience === "student" && (
            <Field id="x-student" label="Student"><NativeSelect id="x-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose a student</option>{options.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          )}
          <Field id="x-from" label={single ? "Date" : "From"}><Input id="x-from" type="date" value={from} max={single ? today : undefined} onChange={(e) => { setFrom(e.target.value); if (single) setTo(e.target.value); }} /></Field>
          {!single && <Field id="x-to" label="To" hint="At most 92 days"><Input id="x-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>}
        </div>
        <Button onClick={download} disabled={busy || invalid}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} {busy ? "Preparing PDF..." : "Download PDF"}
        </Button>
      </CardContent>
    </Card>
  );
}
