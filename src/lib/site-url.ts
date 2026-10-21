/**
 * Base URL used in auth emails. Browser only.
 *  - On localhost the current origin is used, so a reset link requested during development comes back to the
 *    dev server even when NEXT_PUBLIC_SITE_URL holds the production URL.
 *  - Everywhere else NEXT_PUBLIC_SITE_URL wins (falling back to the current origin).
 * Whatever this returns must be allow-listed under Supabase -> Authentication -> URL Configuration -> Redirect URLs.
 */
export function siteUrl() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  return (local ? location.origin : process.env.NEXT_PUBLIC_SITE_URL || location.origin).replace(/\/$/, "");
}
