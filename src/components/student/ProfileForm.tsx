"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { StudentAvatar } from "@/components/StudentAvatar";
import { updateProfileAction } from "@/app/actions/student";
import { splitCommaList } from "@/lib/student-utils";
import { TRACKS, type Track } from "@/lib/types";

export interface BatchOption {
  id: string;
  label: string;
}

export function ProfileForm({
  initial,
  batches,
}: {
  initial: { name: string; track: Track; batchId: string | null; bio: string; skills: string[]; imageUrl: string | null };
  batches: BatchOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<UploadedAsset[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await updateProfileAction({
      name: f.get("name"),
      track: f.get("track"),
      batchId: f.get("batch"),
      bio: f.get("bio"),
      skills: splitCommaList(String(f.get("skills") ?? "")),
      newImage: image[0],
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Profile saved");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5" noValidate>
      <div className="flex items-center gap-4">
        <StudentAvatar name={initial.name} imageUrl={image[0]?.url ?? initial.imageUrl} size={72} />
        <ImageUploader purpose="avatar" value={image} onChange={setImage} max={1} label="Upload photo" />
      </div>
      <Field id="name" label="Full name"><Input id="name" name="name" defaultValue={initial.name} maxLength={120} required /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="track" label="Track">
          <NativeSelect id="track" name="track" defaultValue={initial.track}>
            {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Field id="batch" label="Batch" hint={batches.length === 0 ? "No batches are open yet. Ask your administrator to create one." : undefined}>
          <NativeSelect id="batch" name="batch" defaultValue={initial.batchId ?? ""} required>
            <option value="" disabled>Select your batch</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="skills" label="Skills" hint="Comma separated, e.g. React, SQL, Docker"><Input id="skills" name="skills" defaultValue={initial.skills.join(", ")} /></Field>
      <Field id="bio" label="About you" hint="Optional, up to 1000 characters."><Textarea id="bio" name="bio" defaultValue={initial.bio} maxLength={1000} /></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || batches.length === 0}>{busy ? "Saving..." : "Save profile"}</Button>
    </form>
  );
}
