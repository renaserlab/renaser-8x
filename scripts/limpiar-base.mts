/**
 * LIMPIEZA DE LA BASE — pedido de Kelin el 30-08-2026, para dejarla lista para trabajo real.
 *
 * Deja SOLO: Inversiones Qori Home SAC (intacta) y Jardín Renaser (vaciada, lista para empezar).
 * Borra las demás empresas y las tres cuentas de prueba que ella nombró, para que esos correos
 * queden libres y puedan volver a registrarse.
 *
 * Barreras que no se pueden saltar aunque alguien edite la lista por error:
 *   - jamás se borra una cuenta con rol consultor;
 *   - jamás se toca Qori Home;
 *   - solo se borran cuentas que estén en la lista explícita de abajo.
 *
 * Uso:
 *   node --env-file=.env.local --import=tsx scripts/limpiar-base.mts            (solo informa)
 *   node --env-file=.env.local --import=tsx scripts/limpiar-base.mts --aplicar
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";

const aplicar = process.argv.includes("--aplicar");
const sb = supabaseAdmin();

/** Lo único que sobrevive con sus datos. */
const INTOCABLE = "Inversiones Qori Home SAC";
/** Sobrevive la empresa y el acceso, pero se vacía su contenido. */
const A_VACIAR = "Jardín Renaser";
/** Las cuentas que Kelin pidió liberar. Nombradas una a una, nunca por patrón. */
const CUENTAS_A_BORRAR = ["kleinmerma@gmail.com", "renasercorporation@gmail.com"];
/** Cuentas que no se borran jamás, pase lo que pase. */
const BLINDADAS = ["kelinmerma@gmail.com", "darrensupaoficial@gmail.com", "jardinrenaser@gmail.com", "rhuaquiramos@gmail.com"];

const log = (s: string) => console.log(s);

const { data: empresas } = await sb.from("companies").select("id,nombre");
const { data: cuentas } = await sb.from("users").select("id,email,rol");

const aBorrar = (empresas ?? []).filter((c) => c.nombre !== INTOCABLE && c.nombre !== A_VACIAR);
const jardin = (empresas ?? []).find((c) => c.nombre === A_VACIAR) ?? null;
const qori = (empresas ?? []).find((c) => c.nombre === INTOCABLE) ?? null;

// ---------- BARRERAS ----------
if (!qori) throw new Error(`No encuentro "${INTOCABLE}". Me detengo: algo no cuadra y no voy a borrar a ciegas.`);
if (!jardin) throw new Error(`No encuentro "${A_VACIAR}". Me detengo.`);
if (aBorrar.some((c) => c.nombre === INTOCABLE)) throw new Error("Qori Home entró en la lista de borrado. Me detengo.");

const cuentasBorrables = (cuentas ?? []).filter((u) => CUENTAS_A_BORRAR.includes(u.email ?? ""));
for (const u of cuentasBorrables) {
  if (u.rol === "consultor") throw new Error(`${u.email} es consultora. No se borra una cuenta de consultora. Me detengo.`);
  if (BLINDADAS.includes(u.email ?? "")) throw new Error(`${u.email} está blindada. Me detengo.`);
}
const noEncontradas = CUENTAS_A_BORRAR.filter((e) => !cuentasBorrables.some((u) => u.email === e));

// ---------- INFORME ----------
log(`\n═════ LIMPIEZA DE LA BASE ${aplicar ? "· APLICANDO" : "· SOLO INFORME"} ═════\n`);
log(`Se conserva intacta:   ${INTOCABLE}`);
log(`Se vacía (queda la empresa y el acceso): ${A_VACIAR}\n`);
log(`Empresas a eliminar (${aBorrar.length}):`);
for (const c of aBorrar) log(`   - ${c.nombre}`);
log(`\nCuentas a liberar (${cuentasBorrables.length}):`);
for (const u of cuentasBorrables) log(`   - ${u.email}`);
if (noEncontradas.length) log(`   (no encontradas, se ignoran: ${noEncontradas.join(", ")})`);
log("");

if (!aplicar) {
  log("Nada se ha tocado. Para ejecutar de verdad: --aplicar\n");
  process.exit(0);
}

// ---------- 1. VACIAR JARDÍN ----------
// Se borra y se vuelve a crear CON EL MISMO IDENTIFICADOR. Enumerar a mano las treinta tablas que
// cuelgan de una empresa es la forma segura de olvidar una y dejar basura invisible; el cascade de
// la base ya sabe hacerlo y está probado. Así queda limpia de verdad, sin huérfanos, y como el
// identificador no cambia, el acceso de la dueña y sus enlaces siguen funcionando.
log(`Vaciando ${A_VACIAR}…`);
const { data: filaJardin } = await sb.from("companies").select("nombre,sector").eq("id", jardin.id).single();
const { data: accesos } = await sb.from("memberships").select("user_id,nivel").eq("company_id", jardin.id);

const { data: archivosJardin } = await sb.rpc("archivos_de_empresa", { p_company_id: jardin.id });
const rutasJardin = (archivosJardin as string[] | null) ?? [];
for (let i = 0; i < rutasJardin.length; i += 100) await sb.storage.from("fuentes").remove(rutasJardin.slice(i, i + 100));

const { error: eBorrar } = await sb.from("companies").delete().eq("id", jardin.id);
if (eBorrar) throw new Error(`No pude vaciar ${A_VACIAR}: ${eBorrar.message}. Me detengo antes de tocar nada más.`);

const { error: eCrear } = await sb.from("companies").insert({
  id: jardin.id,
  nombre: filaJardin?.nombre ?? A_VACIAR,
  sector: filaJardin?.sector ?? null,
  // La ficha se vacía: lo que había eran datos de prueba y volver a ponerlos toma medio minuto.
  ficha: {},
  etapa: "levantamiento",
  estado_admision: "admitida",
});
if (eCrear) throw new Error(`BORRÉ ${A_VACIAR} Y NO PUDE RECREARLA: ${eCrear.message} · identificador ${jardin.id}`);

for (const a of accesos ?? []) await sb.from("memberships").insert({ company_id: jardin.id, user_id: a.user_id, nivel: a.nivel });
log(`   Vaciada. ${rutasJardin.length} archivos borrados. Mismo identificador y ${(accesos ?? []).length} acceso(s) restaurado(s).\n`);

// ---------- 2. ELIMINAR EMPRESAS ----------
log("Eliminando empresas…");
let archivosTotal = 0;
for (const c of aBorrar) {
  const { data: archivos } = await sb.rpc("archivos_de_empresa", { p_company_id: c.id });
  const rutas = (archivos as string[] | null) ?? [];
  for (let i = 0; i < rutas.length; i += 100) await sb.storage.from("fuentes").remove(rutas.slice(i, i + 100));
  archivosTotal += rutas.length;
  const { error } = await sb.from("companies").delete().eq("id", c.id);
  log(`   ${error ? "FALLA" : "OK   "} ${c.nombre}${rutas.length ? ` (${rutas.length} archivos)` : ""}${error ? ` — ${error.message}` : ""}`);
}
log(`   ${archivosTotal} archivos borrados en total.\n`);

// ---------- 3. LIBERAR CUENTAS ----------
log("Liberando cuentas…");
for (const u of cuentasBorrables) {
  const { error } = await sb.auth.admin.deleteUser(u.id);
  if (error) {
    log(`   FALLA ${u.email} — ${error.message}`);
    continue;
  }
  // La fila de `users` puede no irse sola si no hay cascade desde auth: se limpia a mano.
  await sb.from("users").delete().eq("id", u.id);
  log(`   OK    ${u.email} — el correo queda libre para registrarse de nuevo`);
}

// ---------- 4. COMPROBACIÓN ----------
const { data: quedan } = await sb.from("companies").select("nombre").order("nombre");
const { count: regJardin } = await sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", jardin.id);
const { data: cuentasFinal } = await sb.from("users").select("email,rol").order("rol", { ascending: false });
log(`\nEmpresas que quedan (${quedan?.length ?? 0}): ${(quedan ?? []).map((c) => c.nombre).join(", ")}`);
log(`Definiciones en ${A_VACIAR}: ${regJardin ?? 0} (debe ser 0)`);
log(`Cuentas que quedan (${cuentasFinal?.length ?? 0}):`);
for (const u of cuentasFinal ?? []) log(`   ${u.rol === "consultor" ? "[consultora] " : "             "}${u.email}`);
log("");
