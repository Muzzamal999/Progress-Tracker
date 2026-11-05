import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStudentPage } from "@/lib/student-session";
import { createClient } from "@/lib/supabase/server";
import { ExchangeWorkspace } from "@/components/student/exchange/ExchangeWorkspace";
import type { ExchangeConnectionRow, ExchangeListingRow, ExchangeParticipantRow, ExchangeRow } from "@/lib/workflow-types";

export const metadata = { title: "Class exchange" };

export default async function ExchangeWorkspacePage({ params }: PageProps<"/dashboard/exchange/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { student } = await requireStudentPage();
  const sb = await createClient();

  const [{ data: exchange }, { data: myRoles }, { data: myConnections }] = await Promise.all([
    sb.from("exchanges").select("*").eq("id", id).maybeSingle(),
    sb.from("exchange_participants").select("*").eq("exchange_id", id).eq("student_id", student.id),
    sb.from("exchange_connections").select("*").eq("exchange_id", id).or(`provider_student_id.eq.${student.id},acceptor_student_id.eq.${student.id}`).order("requested_at", { ascending: false }),
  ]);
  if (!exchange || !myRoles || myRoles.length === 0) notFound();

  const roles = (myRoles as ExchangeParticipantRow[]).map((r) => r.role);
  const connections = (myConnections ?? []) as ExchangeConnectionRow[];
  const isProvider = roles.includes("provider");
  const isAcceptor = roles.includes("acceptor");

  const [{ data: myListing }, { data: browseListings }] = await Promise.all([
    isProvider ? sb.from("exchange_listings").select("*").eq("exchange_id", id).eq("provider_student_id", student.id).maybeSingle() : Promise.resolve({ data: null }),
    isAcceptor ? sb.from("exchange_listings").select("*").eq("exchange_id", id).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);

  // Identities stay hidden by default; only resolved when this exchange explicitly turns anonymity off.
  let counterpartNames: Record<string, string> = {};
  if (!(exchange as ExchangeRow).is_anonymous && connections.length > 0) {
    const otherIds = [...new Set(connections.map((c) => (c.provider_student_id === student.id ? c.acceptor_student_id : c.provider_student_id)))];
    const { data: others } = await sb.from("students").select("id, name").in("id", otherIds);
    counterpartNames = Object.fromEntries((others ?? []).map((o) => [o.id, o.name]));
  }

  return (
    <ExchangeWorkspace
      myStudentId={student.id}
      exchange={exchange as ExchangeRow}
      roles={roles}
      connections={connections}
      myListing={myListing as ExchangeListingRow | null}
      browseListings={(browseListings ?? []) as ExchangeListingRow[]}
      counterpartNames={counterpartNames}
    />
  );
}
