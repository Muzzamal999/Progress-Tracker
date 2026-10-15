import { createClient } from "@/lib/supabase/server";
import { BadgeRulesForm } from "@/components/admin/workflow/BadgeRulesForm";
import type { BadgeRule } from "@/lib/workflow-types";

export const metadata = { title: "Badge rules" };

export default async function BadgesAdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("badge_definitions").select("*").order("position");
  if (error) throw new Error(error.message);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Badge rules</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Students move through the badges in this order. Each badge needs the set number of unique, Admin-approved projects (default 3); extra approvals flow into the next badge.
          Turning a certificate on issues a verifiable PDF when the badge is completed. Changes never take away a badge a student has already earned.
        </p>
      </header>
      <BadgeRulesForm initial={data as BadgeRule[]} />
    </div>
  );
}
