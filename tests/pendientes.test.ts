/**
 * Lo que NO se puede probar sin Supabase o sin navegador. Quedan registrados como pendientes
 * para que el reporte de tests no los cuente como cubiertos. Ver SUPABASE_READINESS.md.
 * Cada uno indica POR QUÉ requiere infraestructura.
 */
import { describe, it } from "vitest";

describe("NO PROBADO — requiere Supabase: RLS y grants solo existen dentro de Postgres", () => {
  it.todo("[P0-01] con JWT de cliente, supabase.rpc('take_job') → 42501 permission denied (el SQL ya lo revoca; tests/p0-schema lo verifica estáticamente)");
  it.todo("[P0-02] con JWT de cliente, from('claims').select('*') → 0 filas; from('claims_cliente') → solo columnas permitidas");
  it.todo("[P0-03] con JWT del dueño, from('interview_responses') → solo sus propias respuestas; las de empleados no aparecen");
  it.todo("[P0-04] con JWT de cliente, from('participants').select('token_hash') → 0 filas; participants_cliente no tiene la columna");
  it.todo("[P0-05] guardar_proceso con una conexión a id inexistente → exception y la tabla queda como antes (transacción real)");
  it.todo("RLS: EMPRESA A nunca ve EMPRESA B (claims, sources, findings, processes, actions, deliverables)");
  it.todo("take_job con 3 workers en paralelo nunca entrega el mismo job (for update skip locked)");
  it.todo("recover_stale_jobs devuelve a pendiente un job con lease vencido y a fallido el que agotó intentos");
  it.todo("idempotency_key unique: reintentar un job de extracción no duplica claims (hoy puede duplicar: P1-10)");
  it.todo("Storage: signed URL expira a los 600 s y un cliente no puede pedir archivo de otra empresa");
  it.todo("Realtime: un cliente recibe cambios de jobs de su empresa (hoy no: sin política RLS → P1-12)");
  it.todo("company_stats se refresca y la bandeja muestra una empresa recién creada (hoy: invisible hasta el primer refresh del worker)");
  it.todo("handle_new_user crea la fila en users al registrarse");
});

describe("NO PROBADO — requiere navegador: React Flow, Web Speech y MediaRecorder no existen en Node", () => {
  it.todo("[P0-05] en Chrome: agregar dos nodos, conectarlos, guardar, recargar → las conexiones persisten (lógica probada en p0-canvas; falta el extremo a extremo)");
  it.todo("React Flow: una conexión desde un nodo decisión sin sourceHandle se dibuja al recargar");
  it.todo("BotonGrabar: Chrome usa SpeechRecognition; Firefox cae a MediaRecorder y el audio llega al servidor");
  it.todo("Una respuesta por audio sin OPENAI_API_KEY deja la sesión bloqueada en 'Escuchando tu respuesta' (P1-11)");
  it.todo("pendienteTranscripcion siempre es false porque estadoSesion no selecciona respuesta_audio_path (P2-01)");
});

describe("NO PROBADO — requiere llamadas reales al modelo", () => {
  it.todo("EXTRACTOR sobre un PDF escaneado de 30 páginas devuelve fragmentos con página");
  it.todo("ENTREVISTADOR cubre los 6 bloques del sueño del dueño antes de declarar sesion_completa (hoy no hay control en código: P1-02)");
  it.todo("CONTRASTADOR: tasa de falsos positivos < 10% sobre el fixture EMPRESA DEMO");
  it.todo("DIAGNOSTICADOR + AUDITOR: precisión > 80% sobre EMPRESA DEMO (métrica del capítulo 39)");
});
