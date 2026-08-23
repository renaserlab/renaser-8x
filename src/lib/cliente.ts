"use client";

/** fetch con errores legibles. Para componentes cliente. */
export async function pedir<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const opts: RequestInit = { ...init };
  if (init?.json !== undefined) {
    opts.method = init.method ?? "POST";
    opts.headers = { "Content-Type": "application/json", ...(init.headers ?? {}) };
    opts.body = JSON.stringify(init.json);
  }
  const r = await fetch(url, opts);
  const texto = await r.text();
  let data: unknown = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Error ${r.status}`;
    throw new Error(msg);
  }
  return data as T;
}
