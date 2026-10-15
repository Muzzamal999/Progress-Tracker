"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBadgeRulesAction } from "@/app/actions/admin-workflow";
import type { BadgeRule } from "@/lib/workflow-types";

export function BadgeRulesForm({ initial }: { initial: BadgeRule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(() => [...initial].sort((a, b) => a.position - b.position));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (i: number, p: Partial<BadgeRule>) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRules((r) => {
      const next = [...r];
      const j = i + d;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    // The array order on screen becomes the badge order.
    const res = await saveBadgeRulesAction(rules.map((r, i) => ({ level: r.level, name: r.name, position: i + 1, required_projects: Number(r.required_projects), certificate_eligible: r.certificate_eligible, is_active: r.is_active })));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Badge rules saved");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {rules.map((r, i) => (
          <li key={r.level} className="grid items-center gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-[auto_8rem_1fr_9rem_auto_auto]">
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${r.name} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            </div>
            <div className="flex items-center gap-2"><span className="w-5 text-sm text-muted-foreground">{i + 1}.</span><Badge level={r.level} size="sm" /></div>
            <Input aria-label={`Name for ${r.level}`} value={r.name} maxLength={60} onChange={(e) => patch(i, { name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <Input aria-label={`Projects required for ${r.name}`} type="number" min={1} max={100} className="w-20" value={r.required_projects} onChange={(e) => patch(i, { required_projects: Number(e.target.value) })} /> projects
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={r.certificate_eligible} onChange={(e) => patch(i, { certificate_eligible: e.target.checked })} /> Certificate</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={r.is_active} onChange={(e) => patch(i, { is_active: e.target.checked })} /> Active</label>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save badge rules"}</Button>
    </div>
  );
}
