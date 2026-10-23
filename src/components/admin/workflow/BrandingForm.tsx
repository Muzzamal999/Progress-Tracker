"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { saveOrgAction } from "@/app/actions/admin-workflow";
import type { OrgSettings } from "@/lib/workflow-types";

export function BrandingForm({ org }: { org: OrgSettings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState<UploadedAsset[]>([]);
  const [removeLogo, setRemoveLogo] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await saveOrgAction({
      orgName: f.get("orgName"), tagline: f.get("tagline"), accentColor: f.get("accent"), secondaryColor: f.get("secondary"),
      signatoryName: f.get("sigName"), signatoryTitle: f.get("sigTitle"), certificateFooter: f.get("footer"),
      newLogo: logo[0], removeLogo,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Branding saved");
    setLogo([]);
    setRemoveLogo(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-5 sm:grid-cols-2" noValidate>
      <Field id="orgName" label="Organisation name" className="sm:col-span-2"><Input id="orgName" name="orgName" defaultValue={org.org_name} required maxLength={120} /></Field>
      <Field id="tagline" label="Tagline (optional)" className="sm:col-span-2"><Input id="tagline" name="tagline" defaultValue={org.tagline ?? ""} maxLength={200} /></Field>
      <Field id="accent" label="Primary colour" hint="Used for the certificate frame and name."><Input id="accent" name="accent" type="color" defaultValue={org.accent_color} className="h-11 w-24 p-1" /></Field>
      <Field id="secondary" label="Accent colour" hint="Used for gold detailing and highlights."><Input id="secondary" name="secondary" type="color" defaultValue={org.secondary_color} className="h-11 w-24 p-1" /></Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Logo</p>
        {org.logo_url && !removeLogo && logo.length === 0 && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={org.logo_url} alt="Current logo" className="h-12 max-w-40 rounded border border-border bg-white object-contain p-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setRemoveLogo(true)}>Remove</Button>
          </div>
        )}
        <ImageUploader purpose="branding" value={logo} onChange={setLogo} max={1} label="Upload logo" />
      </div>
      <Field id="sigName" label="Signatory name"><Input id="sigName" name="sigName" defaultValue={org.signatory_name ?? ""} maxLength={120} /></Field>
      <Field id="sigTitle" label="Signatory title"><Input id="sigTitle" name="sigTitle" defaultValue={org.signatory_title ?? ""} maxLength={120} /></Field>
      <Field id="footer" label="Certificate footer text (optional)" className="sm:col-span-2"><Input id="footer" name="footer" defaultValue={org.certificate_footer ?? ""} maxLength={300} /></Field>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save branding"}</Button></div>
    </form>
  );
}
