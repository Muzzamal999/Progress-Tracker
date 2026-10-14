"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutGrid, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react";
import { Badge } from "@/components/Badge";
import { StudentAvatar } from "@/components/StudentAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteStudentAction } from "@/app/actions/students";
import { trackColor } from "@/lib/student-utils";
import { BADGE_ORDER, TRACKS, type AdminStudent } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";

export function AdminDashboard({ initialStudents }: { initialStudents: AdminStudent[] }) {
  const [students, setStudents] = useState(initialStudents);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState("");
  const [track, setTrack] = useState(ALL);
  const [badge, setBadge] = useState(ALL);
  const [toDelete, setToDelete] = useState<AdminStudent | null>(null);

  const remove = useMutation({
    mutationFn: async (s: AdminStudent) => {
      const res = await deleteStudentAction(s.id);
      if (!res.ok) throw new Error(res.error);
      return s;
    },
    onSuccess: (s) => {
      setStudents((list) => list.filter((x) => x.id !== s.id));
      toast.success(`${s.name} was deleted`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete student"),
    onSettled: () => setToDelete(null),
  });

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students.filter(
      (s) =>
        (!term || s.name.toLowerCase().includes(term)) &&
        (track === ALL || s.track === track) &&
        (badge === ALL || s.badge === badge),
    );
  }, [students, q, track, badge]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Students ({students.length})</h1>
          <p className="mt-1 text-muted-foreground">Add, edit and remove student records. Changes appear on the public site immediately.</p>
        </div>
        <Button asChild>
          <Link href="/admin/students/new">
            <Plus /> Add Student
          </Link>
        </Button>
      </header>

      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Students", value: students.length },
          { label: "Projects", value: students.reduce((n, s) => n + s.projects.length, 0) },
          { label: "Tracks in use", value: new Set(students.map((s) => s.track)).size },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5">
            <dd className="text-2xl font-extrabold sm:text-3xl">{t.value}</dd>
            <dt className="text-xs text-muted-foreground sm:text-sm">{t.label}</dt>
          </div>
        ))}
      </dl>

      <Card className="border-border bg-card">
        <CardContent className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search by name" placeholder="Search by name..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={track} onValueChange={setTrack}>
            <SelectTrigger aria-label="Filter by track">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tracks</SelectItem>
              {TRACKS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={badge} onValueChange={setBadge}>
            <SelectTrigger aria-label="Filter by badge">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All badges</SelectItem>
              {BADGE_ORDER.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2" role="group" aria-label="View">
            <Button variant={view === "cards" ? "default" : "outline"} onClick={() => setView("cards")} aria-pressed={view === "cards"}>
              <LayoutGrid /> Cards
            </Button>
            <Button variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")} aria-pressed={view === "table"}>
              <Table2 /> Table
            </Button>
          </div>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-12 text-center text-muted-foreground">No students found. Add one to get started.</CardContent>
        </Card>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <Card key={s.id} className="border-border bg-card">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <StudentAvatar name={s.name} imageUrl={s.image_url} size={56} />
                  <Badge level={s.badge} size="sm" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{s.name}</h2>
                  <p className="truncate text-sm text-muted-foreground">{s.email ?? "No email"}</p>
                  <p className={cn("text-sm", trackColor(s.track))}>{s.track}</p>
                </div>
                <RowActions student={s} onDelete={setToDelete} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Track</th>
                <th className="p-4 font-medium">Badge</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-border/30 last:border-0">
                  <td className="p-4 font-medium">{s.name}</td>
                  <td className="p-4 text-muted-foreground">{s.email ?? "—"}</td>
                  <td className={cn("p-4", trackColor(s.track))}>{s.track}</td>
                  <td className="p-4">
                    <Badge level={s.badge} size="sm" />
                  </td>
                  <td className="p-4">
                    <RowActions student={s} onDelete={setToDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && !remove.isPending && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the student, their projects and their profile image. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete);
              }}
            >
              {remove.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowActions({ student, onDelete }: { student: AdminStudent; onDelete: (s: AdminStudent) => void }) {
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/students/${student.id}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <Button variant="destructive" size="sm" onClick={() => onDelete(student)}>
        <Trash2 /> Delete
      </Button>
    </div>
  );
}
