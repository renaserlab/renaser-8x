import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente con la sesión del usuario: respeta RLS. Para páginas y rutas. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* desde un Server Component no se pueden escribir cookies; el proxy las refresca */
          }
        },
      },
    }
  );
}
