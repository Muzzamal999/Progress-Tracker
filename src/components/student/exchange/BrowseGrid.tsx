"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/field";
import { requestConnectionAction } from "@/app/actions/exchange";
import type { ExchangeListingRow } from "@/lib/workflow-types";

export function BrowseGrid({ listings, connectedProviderIds, canConnect }: { listings: ExchangeListingRow[]; connectedProviderIds: Set<string>; canConnect: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const available = listings.filter((l) => !connectedProviderIds.has(l.provider_student_id));

  async function connect(listingId: string) {
    setBusyId(listingId);
    const res = await requestConnectionAction(listingId);
    setBusyId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Connected — you can start chatting below");
    router.refresh();
  }

  if (available.length === 0) return <EmptyState title="No listings to browse right now">{listings.length > 0 ? "You're already connected to every available provider." : "Providers haven't posted their projects yet. Check back soon."}</EmptyState>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {available.map((l) => (
        <li key={l.id} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
          <Collapsible>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{l.project_name}</p>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="Open details"><ChevronDown className="h-4 w-4" /> Open</Button>
              </CollapsibleTrigger>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{l.links.length} link{l.links.length === 1 ? "" : "s"}{l.pdf ? " · PDF attached" : ""}</p>
            <CollapsibleContent className="mt-3 space-y-3 border-t border-border pt-3">
              {l.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{l.description}</p>}
              <div className="flex flex-wrap gap-2">
                {l.links.map((lk, i) => (
                  <a key={i} href={lk.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><ExternalLink className="h-3 w-3" /> {lk.label}</a>
                ))}
                {l.pdf && <a href={l.pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><FileText className="h-3 w-3" /> {l.pdf.name}</a>}
              </div>
              <Button type="button" size="sm" disabled={!canConnect || busyId === l.id} onClick={() => connect(l.id)}>
                {busyId === l.id ? "Connecting..." : canConnect ? "Start communication" : "You're already connected elsewhere"}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </li>
      ))}
    </ul>
  );
}
