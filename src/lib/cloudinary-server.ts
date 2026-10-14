import "server-only";
import { v2 as cloudinary } from "cloudinary";

export const CLOUDINARY_FOLDER = "student-journey/avatars";
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
export function signUpload() {
  const { cloudName, apiKey, apiSecret } = config();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: CLOUDINARY_FOLDER, allowed_formats: ALLOWED_FORMATS },
    apiSecret,
  );
  return { timestamp, signature, apiKey, cloudName, folder: CLOUDINARY_FOLDER, allowedFormats: ALLOWED_FORMATS };
}

/** Only accept ids/URLs that came from our own folder and cloud. Deletion is by public_id only. */
export function isOwnAsset(publicId: string, url: string): boolean {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return (
    !!cloud &&
    publicId.startsWith(`${CLOUDINARY_FOLDER}/`) &&
    !publicId.includes("..") &&
    url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)
  );
}

export async function destroyImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId || !publicId.startsWith(`${CLOUDINARY_FOLDER}/`)) return;
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
