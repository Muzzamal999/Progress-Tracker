"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageIcon, Plus, Trash2 } from "lucide-react";
import { StudentAvatar } from "@/components/StudentAvatar";
import { TagInput } from "@/components/admin/TagInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveStudentAction } from "@/app/actions/students";
import { BADGE_ORDER, PROJECT_TYPES, TRACKS, type AdminStudent } from "@/lib/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_MB, studentSchema, type StudentFormInput, type StudentValues } from "@/lib/validation";

const emptyProject = (): StudentFormInput["projects"][number] => ({ title: "", type: "mini", solo: true, stack: [], link: "" });

interface UploadedImage {
  url: string;
  publicId: string;
}

async function uploadToCloudinary(file: File): Promise<UploadedImage> {
  const signRes = await fetch("/api/cloudinary/sign", { method: "POST" });
  if (!signRes.ok) throw new Error("Could not start the image upload");
  const sig = (await signRes.json()) as {
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
    folder: string;
    allowedFormats: string;
  };
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", sig.apiKey);
  body.append("timestamp", String(sig.timestamp));
  body.append("signature", sig.signature);
  body.append("folder", sig.folder);
  body.append("allowed_formats", sig.allowedFormats);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new Error("Image upload failed");
  const json = (await res.json()) as { secure_url: string; public_id: string };
  return { url: json.secure_url, publicId: json.public_id };
}

export function StudentForm({ student, skillSuggestions }: { student?: AdminStudent; skillSuggestions: string[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const form = useForm<StudentFormInput, unknown, StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      name: student?.name ?? "",
      email: student?.email ?? "",
      track: student?.track ?? "Web",
      badge: student?.badge ?? "Bronze",
      skills: student?.skills ?? [],
      projects: student?.projects.length
        ? student.projects.map((p) => ({ title: p.title, type: p.type, solo: p.solo, stack: p.stack, link: p.link ?? "" }))
        : [emptyProject()],
    },
  });
  const { register, control, handleSubmit, setError, formState } = form;
  const { errors } = formState;
  const projects = useFieldArray({ control, name: "projects" });

  // Object URLs are created in the change handler and revoked when replaced or on unmount.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function setFileWithPreview(f: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
    setFile(f);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!f) return setFileWithPreview(null);
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      setFileError("Choose a JPG, PNG or WebP image");
      e.target.value = "";
      return setFileWithPreview(null);
    }
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFileError(`Image must be ${MAX_IMAGE_MB} MB or smaller`);
      e.target.value = "";
      return setFileWithPreview(null);
    }
    setFileWithPreview(f);
  }

  const save = useMutation({
    mutationFn: async (values: StudentValues) => {
      let uploaded: UploadedImage | undefined;
      if (file) uploaded = await uploadToCloudinary(file);
      const res = await saveStudentAction({ id: student?.id, values, newImage: uploaded });
      if (!res.ok) {
        // The server already cleans up on DB failure; this covers failures before that point.
        if (uploaded) {
          void fetch("/api/cloudinary/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicId: uploaded.publicId }),
          });
        }
        const err = new Error(res.error) as Error & { field?: string };
        err.field = res.field;
        throw err;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success(student ? "Student updated" : "Student added");
      router.push("/admin");
      router.refresh();
    },
    onError: (e: Error & { field?: string }) => {
      if (e.field === "email") setError("email", { message: e.message });
      toast.error(e.message || "Could not save student");
    },
  });

  const pending = save.isPending;
  const shownImage = preview ?? student?.image_url ?? null;
  const nameValue = useWatch({ control, name: "name" });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="mx-auto max-w-3xl space-y-6" noValidate>
      <h1 className="text-3xl font-bold">{student ? `Edit ${student.name}` : "Add Student"}</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name *</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Profile image</Label>
            <div className="flex items-center gap-4">
              {shownImage ? (
                <StudentAvatar name={nameValue || "Student"} imageUrl={shownImage} size={72} />
              ) : (
                <div className="flex h-18 w-18 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ImageIcon className="h-6 w-6" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 space-y-1">
                <Input id="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB.
                  {student?.image_url && " Uploading a file replaces the current image."}
                </p>
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="track">Track</Label>
              <Controller
                control={control}
                name="track"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="track">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRACKS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge">Badge</Label>
              <Controller
                control={control}
                name="badge"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="badge">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_ORDER.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skills">Skills</Label>
            <Controller
              control={control}
              name="skills"
              render={({ field }) => (
                <TagInput
                  id="skills"
                  label="Skills"
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={skillSuggestions}
                  placeholder="Type a skill and press Enter or comma"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">Duplicates are merged ignoring case.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xl">Projects</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => projects.append(emptyProject())}>
            <Plus /> Add Project
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.fields.map((field, i) => {
            const pe = errors.projects?.[i];
            return (
              <fieldset key={field.id} className="space-y-4 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm text-muted-foreground">Project {i + 1}</legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`p-title-${i}`}>Title</Label>
                    <Input id={`p-title-${i}`} aria-invalid={!!pe?.title} {...register(`projects.${i}.title`)} />
                    {pe?.title && <p className="text-sm text-destructive">{pe.title.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`p-type-${i}`}>Type</Label>
                    <Controller
                      control={control}
                      name={`projects.${i}.type`}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger id={`p-type-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="capitalize">
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`p-stack-${i}`}>Stack</Label>
                  <Controller
                    control={control}
                    name={`projects.${i}.stack`}
                    render={({ field: f }) => (
                      <TagInput id={`p-stack-${i}`} label="Stack" value={f.value} onChange={f.onChange} placeholder="HTML, CSS, JS" />
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`p-link-${i}`}>Link (optional)</Label>
                    <Input id={`p-link-${i}`} type="url" placeholder="https://" aria-invalid={!!pe?.link} {...register(`projects.${i}.link`)} />
                    {pe?.link && <p className="text-sm text-destructive">{pe.link.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`p-solo-${i}`}>Work mode</Label>
                    <Controller
                      control={control}
                      name={`projects.${i}.solo`}
                      render={({ field: f }) => (
                        <Select value={f.value ? "solo" : "team"} onValueChange={(v) => f.onChange(v === "solo")}>
                          <SelectTrigger id={`p-solo-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solo">Solo</SelectItem>
                            <SelectItem value="team">Team</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => projects.remove(i)}>
                  <Trash2 /> Remove
                </Button>
              </fieldset>
            );
          })}
          {projects.fields.length === 0 && <p className="text-sm text-muted-foreground">No projects. Use “Add Project” to add one.</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button asChild variant="outline">
          <Link href="/admin">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : student ? "Save changes" : "Add student"}
        </Button>
      </div>
    </form>
  );
}
