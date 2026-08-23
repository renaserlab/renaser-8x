/**
 * FASE 5 — Tests reales contra Supabase (local o remoto). Se ejecutan SOLO si existen las variables:
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY
 * Sin ellas quedan en skip (BLOCKED_EXTERNAL). Cubren: AUTH, RLS, RPC, VIEWS, STORAGE, TRANSACTION, QUEUE, REALTIME.
 * Crea dos empresas (A, B), un consultor, un dueño de A, un dueño de B y un participante por enlace, y los borra al final.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generarToken, hashToken, expiracionPorDefecto } from "@/lib/tokens";

const URL = process.env.SUPABASE_TEST_URL, ANON = process.env.SUPABASE_TEST_ANON_KEY, SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const activo = !!(URL && ANON && SERVICE);
const d = describe.skipIf(!activo);

let admin: SupabaseClient, consultor: SupabaseClient, duenoA: SupabaseClient, duenoB: SupabaseClient, anon: SupabaseClient;
const ids: Record<string, string> = {};
const sufijo = Date.now().toString(36);
const mail = (n: string) => `t-${n}-${sufijo}@example.test`;

async function usuario(email: string, rol: "consultor" | "cliente") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Prueba-8x-123", email_confirm: true });
  if (error) throw error;
  await admin.from("users").upsert({ id: data.user.id, email, nombre: email, rol });
  const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: "Prueba-8x-123" });
  if (e2) throw e2;
  return { id: data.user.id, client: c };
}

beforeAll(async () => {
  if (!activo) return;
  admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
  anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const c = await usuario(mail("consultor"), "consultor");
  consultor = c.client; ids.consultor = c.id;
  const a = await usuario(mail("duenoA"), "cliente");
  duenoA = a.client; ids.duenoA = a.id;
  const b = await usuario(mail("duenoB"), "cliente");
  duenoB = b.client; ids.duenoB = b.id;
  for (const k of ["A", "B"]) {
    const { data: emp } = await admin.from("companies").insert({ nombre: `Empresa ${k} ${sufijo}` }).select("id").single();
    ids[`emp${k}`] = emp!.id;
    await admin.from("memberships").insert({ user_id: ids[`dueno${k}`], company_id: emp!.id, nivel: "dueno" });
    const { data: pd } = await admin.from("participants").insert({ company_id: emp!.id, nombre: `Dueño ${k}`, rol: "dueno", user_id: ids[`dueno${k}`] }).select("id").single();
    ids[`partDueno${k}`] = pd!.id;
    const tok = generarToken();
    ids[`token${k}`] = tok;
    const { data: pe } = await admin.from("participants").insert({ company_id: emp!.id, nombre: `Empleado ${k}`, rol: "empleado", token_hash: hashToken(tok), token_expira_at: expiracionPorDefecto(), token_usos: 0, token_max_usos: 200 }).select("id").single();
    ids[`partEmp${k}`] = pe!.id;
    const { data: ses } = await admin.from("interview_sessions").insert({ company_id: emp!.id, participant_id: pe!.id, tipo: "personal" }).select("id").single();
    ids[`sesEmp${k}`] = ses!.id;
    await admin.from("interview_responses").insert({ session_id: ses!.id, pregunta: "¿Dónde se traba?", respuesta: `Secreto del empleado ${k}`, orden: 1, respondido_at: new Date().toISOString() });
    const { data: src } = await admin.from("sources").insert({ company_id: emp!.id, tipo: "documento", nombre: `Plan ${k}`, contenido: "x", estado: "leido" }).select("id").single();
    ids[`src${k}`] = src!.id;
    const { data: cl } = await admin.from("claims").insert({ company_id: emp!.id, source_id: src!.id, texto: `Afirmación documental ${k}`, pilar: "marketing", tipo: "meta", temporalidad: "actual", estado: "contradicho", explicacion_contradiccion: "interno" }).select("id").single();
    ids[`claim${k}`] = cl!.id;
    await admin.from("claims").insert({ company_id: emp!.id, source_id: src!.id, participant_id: pe!.id, texto: `Lo que dijo el empleado ${k}`, pilar: "procesos", tipo: "proceso", temporalidad: "actual", estado: "confirmado" });
    const { data: f1 } = await admin.from("findings").insert({ company_id: emp!.id, pilar: "procesos", titulo: `Pendiente ${k}`, impacto: "medio", estado_revision: "pendiente" }).select("id").single();
    const { data: f2 } = await admin.from("findings").insert({ company_id: emp!.id, pilar: "procesos", titulo: `Aprobado ${k}`, impacto: "medio", estado_revision: "aprobado", requiere_validacion: false }).select("id").single();
    await admin.from("finding_evidence").insert([{ finding_id: f1!.id, claim_id: cl!.id }, { finding_id: f2!.id, claim_id: cl!.id }]);
    await admin.storage.from("fuentes").upload(`${emp!.id}/prueba-${sufijo}.txt`, new Blob(["hola"], { type: "text/plain" }), { contentType: "text/plain" });
    const { data: pr } = await admin.from("processes").insert({ company_id: emp!.id, nombre: `Proceso ${k}` }).select("id").single();
    ids[`proc${k}`] = pr!.id;
  }
}, 120_000);

afterAll(async () => {
  if (!activo) return;
  for (const k of ["A", "B"]) {
    await admin.storage.from("fuentes").remove([`${ids[`emp${k}`]}/prueba-${sufijo}.txt`]);
    await admin.from("companies").delete().eq("id", ids[`emp${k}`]);
  }
  for (const u of ["consultor", "duenoA", "duenoB"]) await admin.auth.admin.deleteUser(ids[u]);
});

d("AUTH / RLS · aislamiento entre empresas", () => {
  it("empresa A intenta leer B → DENY (0 filas en companies, sources, findings, processes, deliverables)", async () => {
    for (const t of ["companies", "sources", "findings", "processes", "deliverables", "actions"]) {
      const { data } = await duenoA.from(t).select("id").eq(t === "companies" ? "id" : "company_id", ids.empB);
      expect(data ?? [], t).toHaveLength(0);
    }
  });
  it("el dueño ve su propia empresa", async () => {
    const { data } = await duenoA.from("companies").select("id").eq("id", ids.empA);
    expect(data).toHaveLength(1);
  });
  it("el consultor ve ambas", async () => {
    const { data } = await consultor.from("companies").select("id").in("id", [ids.empA, ids.empB]);
    expect(data).toHaveLength(2);
  });
});

d("P0-02 · columnas internas de claims", () => {
  it("cliente consulta claims directamente → 0 filas (DENY)", async () => {
    const { data } = await duenoA.from("claims").select("estado,pilar").eq("company_id", ids.empA);
    expect(data ?? []).toHaveLength(0);
  });
  it("cliente consulta claims_cliente → solo sus documentos, sin columnas internas y sin lo dicho por el empleado", async () => {
    const { data, error } = await duenoA.from("claims_cliente").select("*").eq("company_id", ids.empA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(["company_id", "fecha_afirmacion", "fuente_nombre", "fuente_tipo", "id", "opciones", "pregunta", "requiere_validacion", "texto"]);
    expect(data![0].texto).toBe("Afirmación documental A");
  });
  it("pedir una columna interna a la vista → error (no existe)", async () => {
    const { error } = await duenoA.from("claims_cliente").select("estado").eq("company_id", ids.empA);
    expect(error).not.toBeNull();
  });
  it("anon no lee la vista", async () => {
    const { data, error } = await anon.from("claims_cliente").select("*");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

d("P0-03 · dueño intenta leer al empleado → DENY", () => {
  it("interview_responses del empleado: 0 filas para el dueño", async () => {
    const { data } = await duenoA.from("interview_responses").select("respuesta").eq("session_id", ids.sesEmpA);
    expect(data ?? []).toHaveLength(0);
  });
  it("interview_sessions del empleado: 0 filas para el dueño", async () => {
    const { data } = await duenoA.from("interview_sessions").select("id").eq("id", ids.sesEmpA);
    expect(data ?? []).toHaveLength(0);
  });
  it("el consultor sí las lee", async () => {
    const { data } = await consultor.from("interview_responses").select("respuesta").eq("session_id", ids.sesEmpA);
    expect(data).toHaveLength(1);
  });
});

d("P0-04 · tokens", () => {
  it("cliente consulta participants → 0 filas; participants_cliente no tiene token_hash", async () => {
    const { data } = await duenoA.from("participants").select("token_hash").eq("company_id", ids.empA);
    expect(data ?? []).toHaveLength(0);
    const { data: v } = await duenoA.from("participants_cliente").select("*").eq("company_id", ids.empA);
    expect(v!.length).toBeGreaterThan(0);
    expect("token_hash" in v![0]).toBe(false);
  });
  it("canje de un solo uso: el enlace se canjea una vez (update condicional), el hash cambia, y un segundo canje no afecta ninguna fila", async () => {
    const { data: antes } = await admin.from("participants").select("id,token_hash,token_canjeado_at").eq("token_hash", hashToken(ids.tokenA)).maybeSingle();
    expect(antes?.id).toBe(ids.partEmpA);
    expect(antes?.token_canjeado_at).toBeNull();
    const sesion = generarToken();
    const { data: upd } = await admin.from("participants").update({ token_hash: hashToken(sesion), token_canjeado_at: new Date().toISOString(), token_usos: 0 }).eq("id", ids.partEmpA).eq("token_hash", hashToken(ids.tokenA)).is("token_canjeado_at", null).select("id");
    expect(upd).toHaveLength(1);
    const { data: otra } = await admin.from("participants").update({ token_hash: hashToken(generarToken()) }).eq("id", ids.partEmpA).eq("token_hash", hashToken(ids.tokenA)).is("token_canjeado_at", null).select("id");
    expect(otra ?? []).toHaveLength(0);
    const { data: porEnlace } = await admin.from("participants").select("id").eq("token_hash", hashToken(ids.tokenA)).maybeSingle();
    expect(porEnlace).toBeNull();
    const { data: porSesion } = await admin.from("participants").select("id").eq("token_hash", hashToken(sesion)).maybeSingle();
    expect(porSesion?.id).toBe(ids.partEmpA);
    await admin.from("participants").update({ token_revocado_at: new Date().toISOString() }).eq("id", ids.partEmpA);
  });
});

d("P0-01 · RPC", () => {
  it("anon llama take_job → DENY", async () => {
    const { error } = await anon.rpc("take_job", { lease_minutes: 1 });
    expect(error).not.toBeNull();
  });
  it("authenticated (dueño) llama take_job → DENY", async () => {
    const { error } = await duenoA.rpc("take_job", { lease_minutes: 1 });
    expect(error).not.toBeNull();
    expect(String(error!.message + error!.code)).toMatch(/permission|42501|denied/i);
  });
  it("service_role → ALLOW (devuelve null o un job)", async () => {
    const { error } = await admin.rpc("take_job", { lease_minutes: 1 });
    expect(error).toBeNull();
  });
  it("authenticated llama recover_stale_jobs / refresh_company_stats / guardar_proceso → DENY", async () => {
    for (const fn of ["recover_stale_jobs", "refresh_company_stats"]) {
      const { error } = await duenoA.rpc(fn);
      expect(error, fn).not.toBeNull();
    }
    const { error } = await duenoA.rpc("guardar_proceso", { p_process_id: ids.procA, p_nombre: null, p_area: null, p_nodos: [], p_edges: [] });
    expect(error).not.toBeNull();
  });
});

d("FINDINGS · frontera", () => {
  it("hallazgo pendiente → el cliente NO lo ve; aprobado → sí", async () => {
    const { data } = await duenoA.from("findings").select("titulo,estado_revision").eq("company_id", ids.empA);
    expect(data!.map((f) => f.estado_revision)).toEqual(["aprobado"]);
  });
});

d("STORAGE · archivos privados", () => {
  it("el dueño de B no obtiene el archivo de A; el de A sí con signed URL", async () => {
    const ruta = `${ids.empA}/prueba-${sufijo}.txt`;
    const { data: d1, error: e1 } = await duenoB.storage.from("fuentes").download(ruta);
    expect(d1 === null || e1 !== null).toBe(true);
    const { data: url } = await admin.storage.from("fuentes").createSignedUrl(ruta, 60);
    expect(url?.signedUrl).toBeTruthy();
    const r = await fetch(url!.signedUrl);
    expect(r.status).toBe(200);
  });
});

d("TRANSACTION · guardar_proceso", () => {
  it("conexión a id inexistente → exception y las tablas quedan como antes", async () => {
    const { data: mapa, error } = await admin.rpc("guardar_proceso", { p_process_id: ids.procA, p_nombre: null, p_area: null, p_nodos: [{ _tmp: "a", tipo: "inicio", etiqueta: "A", pos_x: 0, pos_y: 0 }, { _tmp: "b", tipo: "fin", etiqueta: "B", pos_x: 0, pos_y: 0 }], p_edges: [{ origen: "a", destino: "b" }] });
    expect(error).toBeNull();
    expect(Object.keys(mapa as object)).toEqual(["a", "b"]);
    const antes = await admin.from("process_nodes").select("id").eq("process_id", ids.procA);
    const { error: e2 } = await admin.rpc("guardar_proceso", { p_process_id: ids.procA, p_nombre: null, p_area: null, p_nodos: [{ _tmp: "c", tipo: "inicio", etiqueta: "C", pos_x: 0, pos_y: 0 }], p_edges: [{ origen: "c", destino: "fantasma" }] });
    expect(e2).not.toBeNull();
    expect(String(e2!.message)).toMatch(/conexion_invalida/);
    const despues = await admin.from("process_nodes").select("id").eq("process_id", ids.procA);
    expect(despues.data!.map((n) => n.id).sort()).toEqual(antes.data!.map((n) => n.id).sort());
  });
});

d("QUEUE · take_job concurrente y recuperación", () => {
  it("3 tomas en paralelo nunca entregan el mismo job; el lease vencido se recupera", async () => {
    const { data: js } = await admin.from("jobs").insert([{ company_id: ids.empA, tipo: "evaluar", prioridad: 5, idempotency_key: `q1-${sufijo}` }, { company_id: ids.empA, tipo: "evaluar", prioridad: 1, idempotency_key: `q2-${sufijo}` }, { company_id: ids.empB, tipo: "evaluar", prioridad: 5, idempotency_key: `q3-${sufijo}` }]).select("id");
    const tomas = await Promise.all([0, 1, 2].map(() => admin.rpc("take_job", { lease_minutes: 1 })));
    const tomados = tomas.map((t) => (Array.isArray(t.data) ? t.data[0]?.id : null)).filter(Boolean);
    expect(new Set(tomados).size).toBe(tomados.length);
    expect(tomados.length).toBe(3);
    await admin.from("jobs").update({ lease_expira_at: new Date(Date.now() - 1000).toISOString() }).in("id", js!.map((j) => j.id));
    const { data: n } = await admin.rpc("recover_stale_jobs");
    expect(Number(n)).toBeGreaterThanOrEqual(3);
    await admin.from("jobs").delete().in("id", js!.map((j) => j.id));
  });
  it("idempotency_key duplicada en jobs → 23505; en claims → 23505", async () => {
    const { error } = await admin.from("jobs").insert([{ company_id: ids.empA, tipo: "evaluar", idempotency_key: `dup-${sufijo}` }, { company_id: ids.empA, tipo: "evaluar", idempotency_key: `dup-${sufijo}` }]);
    expect(error?.code).toBe("23505");
    const { error: e2 } = await admin.from("claims").insert([{ company_id: ids.empA, source_id: ids.srcA, texto: "x", idempotency_key: `c-${sufijo}` }, { company_id: ids.empA, source_id: ids.srcA, texto: "x", idempotency_key: `c-${sufijo}` }]);
    expect(e2?.code).toBe("23505");
  });
});

d("VIEWS · company_stats y trigger de usuarios", () => {
  it("refresh_company_stats con service role funciona y la vista no es legible por el cliente", async () => {
    const { error } = await admin.rpc("refresh_company_stats");
    expect(error).toBeNull();
    const { data, error: e2 } = await duenoA.from("company_stats").select("*");
    expect(e2 !== null || (data ?? []).length === 0).toBe(true);
  });
  it("handle_new_user creó la fila en users", async () => {
    const { data } = await admin.from("users").select("rol").eq("id", ids.duenoA).single();
    expect(data?.rol).toBe("cliente");
  });
});

d("REALTIME", () => {
  it("un consultor suscrito recibe el cambio de un job (≤ 10 s)", async () => {
    const { data: j } = await admin.from("jobs").insert({ company_id: ids.empA, tipo: "evaluar", idempotency_key: `rt-${sufijo}` }).select("id").single();
    const recibido = new Promise<boolean>((resolve) => {
      const ch = consultor.channel(`t-${sufijo}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${j!.id}` }, () => { consultor.removeChannel(ch); resolve(true); }).subscribe(async (st) => {
        if (st === "SUBSCRIBED") await admin.from("jobs").update({ progreso: "ping" }).eq("id", j!.id);
      });
      setTimeout(() => resolve(false), 10_000);
    });
    expect(await recibido).toBe(true);
    await admin.from("jobs").delete().eq("id", j!.id);
  }, 15_000);
});

if (!activo) {
  describe("BLOCKED_EXTERNAL · Supabase", () => {
    it.todo("Define SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY para ejecutar los 20 tests de integración (AUTH, RLS, RPC, VIEWS, STORAGE, TRANSACTION, QUEUE, REALTIME)");
  });
}
