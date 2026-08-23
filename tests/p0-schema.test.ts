/**
 * Verificación estática del SQL (P0-01..P0-05). No sustituye la prueba contra Postgres (ver pendientes.test.ts),
 * pero garantiza que el esquema que se va a ejecutar contiene exactamente las protecciones esperadas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const sql = readFileSync(path.resolve(__dirname, "../supabase/schema.sql"), "utf8").replace(/--[^\n]*/g, "");
const norm = sql.replace(/\s+/g, " ").toLowerCase();

describe("P0-01 · RPC de la cola no ejecutables por el navegador", () => {
  for (const fn of ["take_job(int, int, int)", "heartbeat_jobs(uuid[], int)", "recover_stale_jobs()", "refresh_company_stats()", "guardar_proceso(uuid, text, text, jsonb, jsonb)", "archivos_de_empresa(uuid)"]) {
    it(`revoke execute ${fn} from public, anon, authenticated + grant to service_role`, () => {
      expect(norm).toContain(`revoke execute on function ${fn} from public, anon, authenticated`);
      expect(norm).toContain(`grant execute on function ${fn} to service_role`);
      expect(norm).not.toMatch(new RegExp(`grant execute on function ${fn.replace(/[()\\[\\]]/g, "\\$&")} to (anon|authenticated|public)`));
    });
  }
  it("las funciones que usan las políticas RLS sí siguen ejecutables por authenticated", () => {
    expect(norm).toContain("grant execute on function es_consultor() to authenticated");
    expect(norm).toContain("grant execute on function mis_empresas() to authenticated");
  });
  it("las RPC sensibles son security definer (por eso el revoke es obligatorio)", () => {
    expect(norm).toMatch(/function take_job\(lease_minutes int default 10, max_pesados_por_empresa int default 2, max_global int default 12\) returns setof jobs language sql security definer/);
  });
});

describe("P0-02 · el cliente no lee columnas internas de claims", () => {
  it("no existe ninguna política de cliente sobre claims (solo consultor_todo aplica)", () => {
    expect(norm).not.toMatch(/create policy cliente_claims/);
  });
  it("existe la vista claims_cliente con exactamente las columnas permitidas", () => {
    const m = norm.match(/create view claims_cliente with \(security_barrier = true\) as select (.*?) from claims c/);
    expect(m).not.toBeNull();
    const cols = m![1];
    for (const prohibida of ["c.estado,", "c.pilar", "c.tipo", "c.temporalidad", "c.contradice_a", "explicacion_contradiccion", "pregunta_sugerida", "c.participant_id,", "validado_por"]) expect(cols).not.toContain(prohibida);
    for (const permitida of ["c.id", "c.texto", "c.fecha_afirmacion", "fuente_nombre", "fuente_tipo", "requiere_validacion", "as pregunta", "as opciones"]) expect(cols).toContain(permitida);
  });
  it("la vista filtra por pertenencia y excluye lo dicho por otras personas", () => {
    expect(norm).toMatch(/from claims c join sources s on s\.id = c\.source_id where c\.company_id in \(select mis_empresas\(\)\) and \(c\.participant_id is null or c\.participant_id in \(select id from participants where user_id = auth\.uid\(\)\)\)/);
  });
  it("la vista se concede a authenticated y se retira a anon/public", () => {
    expect(norm).toContain("revoke all on claims_cliente from public, anon");
    expect(norm).toContain("grant select on claims_cliente to authenticated");
  });
});

describe("P0-03 · respuestas de empleados invisibles para el dueño", () => {
  it("cliente_sessions exige participants.user_id = auth.uid()", () => {
    expect(norm).toMatch(/create policy cliente_sessions on interview_sessions for select using \(participant_id in \(select id from participants where user_id = auth\.uid\(\)\)\)/);
  });
  it("cliente_responses exige la misma condición a través de la sesión", () => {
    expect(norm).toMatch(/create policy cliente_responses on interview_responses for select using \(session_id in \(select s\.id from interview_sessions s join participants p on p\.id = s\.participant_id where p\.user_id = auth\.uid\(\)\)\)/);
  });
  it("ninguna política de cliente sobre sesiones/respuestas usa solo mis_empresas()", () => {
    expect(norm).not.toMatch(/create policy cliente_(sessions|responses)[^;]*company_id in \(select mis_empresas\(\)\)\)/);
  });
});

describe("P0-04 · el token de participante nunca llega al cliente y no se guarda en claro", () => {
  it("participants no tiene columna token en claro; tiene hash, expiración, revocación y usos", () => {
    expect(norm).not.toMatch(/token text unique default encode/);
    expect(norm).toContain("token_hash text unique");
    expect(norm).toContain("token_expira_at timestamptz");
    expect(norm).toContain("token_revocado_at timestamptz");
    expect(norm).toContain("token_usos int default 0");
    expect(norm).toContain("alter table participants drop column if exists token;");
  });
  it("no existe política de cliente sobre participants; la vista participants_cliente no expone el hash", () => {
    expect(norm).not.toMatch(/create policy cliente_participants/);
    const m = norm.match(/create view participants_cliente with \(security_barrier = true\) as select (.*?) from participants/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain("token");
    expect(m![1]).not.toContain("user_id");
  });
});

describe("P0-05 · guardado atómico del canvas en Postgres", () => {
  it("guardar_proceso existe, resuelve _tmp y lanza excepción ante conexión inválida (→ rollback)", () => {
    expect(norm).toContain("create or replace function guardar_proceso(p_process_id uuid, p_nombre text, p_area text, p_nodos jsonb, p_edges jsonb)");
    expect(norm).toContain("coalesce(n->>'_tmp', n->>'id', nuevo_id::text)");
    expect(norm).toContain("raise exception 'conexion_invalida: % -> %'");
    expect(norm).toMatch(/delete from process_nodes where process_id = p_process_id and not \(id = any\(conservados\)\)/);
  });
});

describe("Regresión: el esquema sigue siendo el esperado", () => {
  it("company_stats no es legible por anon/authenticated", () => {
    expect(norm).toContain("revoke select on company_stats from anon, authenticated");
  });
  it("findings solo aprobados/corregidos para el cliente; deliverables solo publicados", () => {
    expect(norm).toMatch(/create policy cliente_findings on findings for select using \(company_id in \(select mis_empresas\(\)\) and estado_revision in \('aprobado','corregido'\)\)/);
    expect(norm).toMatch(/create policy cliente_deliverables on deliverables for select using \(company_id in \(select mis_empresas\(\)\) and publicado = true\)/);
  });
  it("jobs, token_usage, corrections, cases, eval_runs, diagnoses, know_how, checkpoints: sin política de cliente", () => {
    for (const t of ["jobs", "token_usage", "corrections", "cases", "eval_runs", "diagnoses", "know_how", "checkpoints"]) expect(norm).not.toMatch(new RegExp(`create policy cliente_\\w+ on ${t} `));
  });
});
