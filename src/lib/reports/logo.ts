import "server-only";

/** Organisation logo as PNG bytes. Only fetched from our own Cloudinary cloud; any failure just means "no logo". */
export async function loadLogoPng(url: string | null): Promise<Uint8Array | null> {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!url || !cloud || !url.startsWith(`https://res.cloudinary.com/${cloud}/`)) return null;
  try {
    const pngUrl = url.replace("/image/upload/", "/image/upload/f_png,w_400/").replace(/\.(webp|jpg|jpeg|png)$/i, ".png");
    const res = await fetch(pngUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
