/** Public base URL used in auth emails: NEXT_PUBLIC_SITE_URL when set, else the current origin. Browser only. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || location.origin).replace(/\/$/, "");
}
