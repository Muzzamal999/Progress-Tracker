const AVATAR = "w_160,h_160,c_fill,g_face,f_auto,q_auto";
const AVATAR_LARGE = "w_300,h_300,c_fill,g_face,f_auto,q_auto";

/** Inserts a transformation into a Cloudinary delivery URL. Non-Cloudinary URLs are returned as-is. */
export function cloudinaryTransform(url: string, transform: string): string {
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (!url.startsWith("https://res.cloudinary.com/") || i === -1) return url;
  return url.slice(0, i + marker.length) + transform + "/" + url.slice(i + marker.length);
}

export const avatarUrl = (url: string, large = false) =>
  cloudinaryTransform(url, large ? AVATAR_LARGE : AVATAR);
