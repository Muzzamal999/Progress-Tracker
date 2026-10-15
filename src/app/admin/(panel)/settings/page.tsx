import { getOrg } from "@/lib/org";
import { BrandingForm } from "@/components/admin/workflow/BrandingForm";

export const metadata = { title: "Organisation branding" };

export default async function SettingsPage() {
  const org = await getOrg();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Organisation branding</h1>
        <p className="mt-1 text-muted-foreground">Shown on certificates and on the public verification page.</p>
      </header>
      <BrandingForm org={org} />
    </div>
  );
}
