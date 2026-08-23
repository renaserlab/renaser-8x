# 8X

Consultoría empresarial asistida por IA. Comprender → contrastar → descubrir → diagnosticar → rediseñar → sistematizar → implementar → medir → aprender.
Implementación de la especificación `8x-sistema-completo` v4. Estado: **1.0.0-rc.1** — ver `V1_FINAL_AUDIT.md`.

## Qué hay

| Capa | Dónde |
|---|---|
| Esquema Supabase (tablas, índices, RLS, vistas seguras, cola con fairness, función atómica del canvas, storage, realtime) | `supabase/schema.sql` |
| Método en texto, sincronizado con el código | `methodology/*.md` |
| Sistema visual (tokens, tipografía, marcas de estado) | `src/design/tokens.css`, `src/components/base/MarcaEstado.tsx` |
| Capa de IA (interfaz propia + Anthropic; transcripción opcional con Whisper) | `src/lib/ai/` |
| 9 agentes + TO-BE, SOP, admisión (prompts con guardia anti-inyección) | `src/lib/ai/agents/` |
| Esquemas Zod de cada salida | `src/lib/schemas/` |
| Reglas sin IA: vigencia, contradicción, evidencia/fuerza, cobertura de entrevistas, suficiencia, grafos, plan, patrones, archivos | `src/lib/rules/`, `src/lib/archivos.ts` |
| Cola + worker (prioridad, fairness por empresa, tope global, heartbeat, reintentos, dead letter) y simulador | `src/lib/jobs/` |
| Rutas de API (34) | `src/app/api/` |
| Panel del consultor · Portal del cliente · Enlace de participante | `src/app/(consultor)/`, `src/app/(cliente)/portal/`, `src/app/participar/` |
| Canvas de procesos (React Flow + dagre, validación en vivo, guardado atómico) | `src/components/canvas/` |
| Benchmark congelado | `benchmark/esperado.json`, `src/lib/benchmark.ts`, `scripts/benchmark-ia.ts` |

## Comandos

```bash
npm run verificar        # typecheck + lint + tests locales + build (puerta de calidad)
npm run test             # vitest (local, sin Supabase ni IA)
npm run test:supabase    # tests de integración reales (requiere SUPABASE_TEST_* en .env.local; usa una base de prueba)
npm run benchmark        # primera prueba con IA real sobre la empresa demo (requiere ANTHROPIC_API_KEY)
npm run dev              # app
npm run worker           # worker de la cola (obligatorio: nada se procesa sin él)
```

## Puesta en marcha

1. **Supabase.** Crea un proyecto (primero uno local con `supabase start` si puedes). En *SQL Editor* pega íntegro `supabase/schema.sql`. Es idempotente. El linter avisará por las vistas `claims_cliente`/`participants_cliente` (intencional: ver `V1_SECURITY_REPORT.md`).
2. **Variables.** Copia `.env.example` a `.env.local`. Mínimo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. `OPENAI_API_KEY` solo para notas de voz subidas.
3. **Tests de integración antes de usar IA:** `npm run test:supabase` con credenciales de una base de prueba. Deben pasar los 24.
4. **Primer consultor.** Regístrate en `/registro` y ejecuta `update users set rol='consultor' where email='tu@correo.com';`.
5. **Benchmark con IA real:** `npm run benchmark`. Compara contra `benchmark/esperado.json`; no cambies prompts si no mejora las métricas.
6. **Empresa #0: la propia consultoría.** Nueva empresa → admisión → fuentes → personas y enlaces → conversar → contrastar → validar → diagnosticar (el sistema dice qué falta) → revisar → TO-BE → plan → publicar.

## Cómo fluye

```
Subir fuente → extraer (tramos; PDF por páginas; CSV por filas; audio con minutos) → claims (fuente, fragmento, fecha, estado)
→ contrastar (reglas + modelo: contradicts/updates/supports/explains/depends_on) → validación (3 botones)
Entrevistas por bloques obligatorios (dueño: origen, empresa, vida, rol, éxito, verdad difícil · equipo: trabajo real, trabas, verdad operativa, lo que ve)
→ claims confirmados por quien los dijo → know-how minado (criticidad, documentado, proceso)
Suficiencia (críticas verificadas, dueño y equipo entrevistados, 5+ por pilar) → diagnosticar por pilar (dimensiones + lentes)
→ AUDITOR → calibración por fuerza de evidencia (STRONG/MEDIUM/WEAK; alto = 2 fuentes o 1 fuerte; si no, requiere validación)
→ filtros Propósito/Sabiduría/Excelencia → consolidación → revisión del consultor (aprobar/corregir/rechazar con motivo)
→ TO-BE (keep/improve/replace/remove/create, humano/software/ia/híbrido, cambios justificados) → SOP → plan 45 días (≤3 frentes/semana)
→ entregables verificados (sin fuente no entra; sin referentes) → publicar (congela) → 45 de monitoreo (cortes, regresiones → hallazgos) → caso
```

Ninguna llamada a IA ocurre dentro de una petición HTTP. Todo pasa por `jobs`.

## Frontera (capítulo 34)

El cliente nunca ve hallazgos sin aprobar ni con validación pendiente, columnas internas, respuestas de otras personas, prompts, otras empresas ni trabajos. Se aplica con RLS y vistas en Supabase y, en las rutas que usan la service role, con `src/lib/frontera.ts` y `src/lib/sesiones.ts`.

## Documentos

`V1_FINAL_AUDIT.md` · `V1_TRACEABILITY.md` · `V1_SECURITY_REPORT.md` · `V1_PERFORMANCE_REPORT.md` · `V1_TEST_REPORT.md` · `V1_KNOWN_LIMITATIONS.md` · `BACKLOG_V2.md` · históricos: `AUDITORIA_IMPLEMENTACION.md`, `MATRIZ_TRAZABILIDAD.md`, `RIESGOS_P0_P1_P2.md`, `TEST_REPORT.md`, `SUPABASE_READINESS.md`.

## Despliegue

Next.js en Vercel (o similar). El worker necesita un proceso largo (Railway, Fly, Render, VM) con las mismas variables. Con 30 empresas activas a la vez, 3 workers × 6 (o `WORKER_CONCURRENCIA=18`) y `WORKER_MAX_GLOBAL=18`: ver `V1_PERFORMANCE_REPORT.md`.
