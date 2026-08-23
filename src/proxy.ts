import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLICAS = ["/entrar", "/registro", "/auth", "/participar", "/api/participar", "/api/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => path === p || path.startsWith(p + "/"));

  if (!data.user && !esPublica) {
    // P2-06: las API responden 401 JSON, no un redirect HTML.
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Tienes que entrar primero." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("volver", path);
    return NextResponse.redirect(url);
  }
  if (data.user && (path === "/entrar" || path === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Los recursos del PWA (manifest e iconos generados) deben ser públicos: el instalador del navegador no tiene sesión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
