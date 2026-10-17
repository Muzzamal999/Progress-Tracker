import "server-only";
import { v2 as cloudinary } from "cloudinary";

export const UPLOAD_PURPOSES = ["avatar", "evidence", "manual", "branding", "manualpdf", "labreport"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
const FOLDERS: Record<UploadPurpose, string> = {
  avatar: "student-journey/avatars",
  evidence: "student-journey/evidence",
  manual: "student-journey/manuals",
  branding: "student-journey/branding",
  manualpdf: "student-journey/manual-pdfs",
  labreport: "student-journey/lab-reports",
};
/** Purposes that carry a PDF instead of an image. */
export const PDF_PURPOSES: readonly UploadPurpose[] = ["manualpdf", "labreport"];
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const CLOUDINARY_ROOT = "student-journey/";
export const CLOUDINARY_FOLDER = FOLDERS.avatar;
export const ALLOWED_FORMATS = "jpg,png,webp";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function config() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary environment variables are missing");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

/** Builds signed upload params. Only these exact params can be used by the browser. */
export function signUpload(purpose: UploadPurpose = "avatar") {
  const folder = FOLDERS[purpose];
  const allowedFormats = PDF_PURPOSES.includes(purpose) ? "pdf" : ALLOWED_FORMATS;
  const { cloudName, apiKey, apiSecret } = config();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats },
    apiSecret,
  );
  return { timestamp, signature, apiKey, cloudName, folder, allowedFormats };
}

/** Only accept ids/URLs that came from our own folder and cloud. Deletion is by public_id only. */
export function isOwnAsset(publicId: string, url: string, purpose: UploadPurpose = "avatar"): boolean {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return (
    !!cloud &&
    publicId.startsWith(`${FOLDERS[purpose]}/`) &&
    !publicId.includes("..") &&
    url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)
  );
}

export async function destroyImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId || !publicId.startsWith(CLOUDINARY_ROOT) || publicId.includes("..")) return;
  config();
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (e) {
    console.error("Cloudinary destroy failed", publicId, e);
  }
}

/** Server-side check of an uploaded asset's real size and format (the browser can lie). */
export async function verifyUploadedImage(publicId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  config();
  try {
    const r = await cloudinary.api.resource(publicId);
    if (r.bytes > MAX_IMAGE_BYTES) return { ok: false, error: "Image is larger than 5 MB" };
    if (!ALLOWED_FORMATS.split(",").includes(String(r.format))) return { ok: false, error: "Only jpg, png or webp images are allowed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Uploaded image could not be verified" };
  }
}

/** Same ownership rule as isOwnAsset, for a PDF uploaded to one of the PDF folders. */
export function isOwnPdf(publicId: string, url: string, purpose: "manualpdf" | "labreport"): boolean {
  return isOwnAsset(publicId, url, purpose);
}

/** Server-side check of an uploaded PDF's real size, format and page count (the browser can lie). */
export async function verifyUploadedPdf(publicId: string): Promise<{ ok: true; pages: number; bytes: number } | { ok: false; error: string }> {
  config();
  try {
    const r = await cloudinary.api.resource(publicId);
    if (String(r.format) !== "pdf") return { ok: false, error: "Only PDF files are allowed" };
    if (r.bytes > MAX_PDF_BYTES) return { ok: false, error: "The PDF is larger than 10 MB" };
    return { ok: true, pages: Number(r.pages) > 0 ? Number(r.pages) : 1, bytes: Number(r.bytes) };
  } catch {
    return { ok: false, error: "Uploaded PDF could not be verified" };
  }
}
