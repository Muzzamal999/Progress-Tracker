import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LEGACY_ID = /^\/student\/(stu-[A-Za-z0-9_-]+)\/?$/;

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  if (!url || !anonKey) return NextResponse.next();

  // Old shared links (/student/stu-002) -> 308 to the new slug URL.
  const legacy = LEGACY_ID.exec(pathname);
  if (legacy) {
    try {
      const res = await fetch(
        `${url}/rest/v1/students?select=slug&legacy_id=eq.${encodeURIComponent(legacy[1])}&limit=1`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
      );
      const rows = (await res.json()) as { slug: string }[];
      if (Array.isArray(rows) && rows[0]?.slug) {
        const target = request.nextUrl.clone();
        target.pathname = `/student/${rows[0].slug}`;
        return NextResponse.redirect(target, 308);
      }
    } catch {
      // fall through: the page itself also handles legacy ids
    }
    return NextResponse.next();
  }
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // /admin/*: refresh the session and require a signed-in admin.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const isLogin = pathname === "/admin/login";

  let isAdmin = false;
  if (user) {
    const { data: row } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    isAdmin = !!row;
  }

  if (isLogin) {
    if (isAdmin) return redirectTo(request, "/admin", response);
    return response;
  }
  if (!isAdmin) return redirectTo(request, "/admin/login", response);
  return response;
}

/** Redirect while keeping any refreshed auth cookies. */
function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const target = request.nextUrl.clone();
  target.pathname = path;
  target.search = "";
  const res = NextResponse.redirect(target);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/student/:id"],
};
