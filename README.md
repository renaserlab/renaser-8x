# 8X

Consultoría empresarial asistida por IA. Audita, diagnostica, sistematiza y multiplica.
Implementación de la especificación `8x-sistema-completo` v4.

## Qué hay

| Capa | Dónde |
|---|---|
| Esquema Supabase (tablas, índices, RLS, cola, vista de bandeja, storage) | `supabase/schema.sql` |
| Sistema visual (tokens, tipografía, marcas de estado) | `src/design/tokens.css`, `src/components/base/MarcaEstado.tsx` |
| Capa de IA (interfaz propia + Anthropic; se cambia en un archivo) | `src/lib/ai/` |
| Los 9 agentes y sus prompts | `src/lib/ai/agents/` |
| Esquemas Zod de cada salida | `src/lib/schemas/` |
| Reglas mecánicas sin IA (vigencia, contradicción, patrones) | `src/lib/rules/` |
| Cola de trabajos + worker (`for update skip locked`, lease, reintentos, prioridades) | `src/lib/jobs/`, `worker/` |
| Rutas de API (capítulo 24) | `src/app/api/` |
| Panel del consultor | `src/app/(consultor)/` |
| Portal del cliente | `src/app/(cliente)/portal/` |
| Enlace de participante (sin cuenta) | `src/app/participar/[token]/` |
| Canvas de procesos (React Flow + dagre) | `src/components/canvas/` |
| Copy centralizado / vocabulario del cliente | `src/lib/textos.ts` |

## Puesta en marcha

1. **Supabase.** Crea un proyecto. En *SQL Editor* pega íntegro `supabase/schema.sql` y ejecútalo.
   En *Authentication → Providers → Email* deja activado Email/Password (puedes desactivar "Confirm email" para probar).
2. **Variables.** Copia `.env.example` a `.env.local` y completa:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
   `OPENAI_API_KEY` es opcional: solo para transcribir notas de voz subidas (WhatsApp). El micrófono del navegador funciona sin ella.
3. **Instalar y correr.**
   ```bash
   npm install
   npm run dev
   ```
   En otra terminal, el worker (es quien llama a la IA; sin él nada se procesa):
   ```bash
   npm run worker
   ```
4. **Primer consultor.** Regístrate en `/registro` con tu correo y luego en el SQL Editor:
   ```sql
   update users set rol='consultor' where email='tu@correo.com';
   ```
   Vuelve a entrar. Verás la bandeja.
5. **Primer caso: la propia consultoría** (capítulo 43). *Nueva empresa* → cuestionario de admisión → sube documentos → agrega personas y cópiales su enlace → conversa → contrasta → diagnostica → revisa hallazgos → TO-BE → plan → publica.

## Cómo fluye

```
Subir fuente → job extraer (troceado) → claims → job contrastar (reglas + modelo) → validación (3 botones)
Entrevistas (dueño por voz, equipo desde su celular por enlace) → claims con participant_id → know-how minado
Diagnosticar por pilar → DIAGNOSTICADOR + AUDITOR → findings con finding_evidence (sin evidencia, no existe)
Consultor aprueba / corrige / rechaza (corrections) → TO-BE + SOP → PLANIFICADOR (máx. 3 frentes/semana)
REDACTOR → 7 entregables → publicar (solo con 0 hallazgos pendientes) → el cliente ve resultados y plan
45 días implementación → 45 monitoreo (cortes quincenales) → cerrar caso → cases + eval
```

Ninguna llamada a IA ocurre dentro de una petición HTTP. Todo pasa por `jobs`; la pantalla lee `jobs.progreso` por Realtime.

## Frontera (capítulo 34)

El cliente nunca ve hallazgos sin aprobar, estados internos, pilares, prompts, otras empresas ni trabajos. Se aplica con RLS en Supabase y, en las rutas de servidor que usan la service role, en código (`/api/companies/[id]/reality`, `/diagnosis`, `/jobs/[id]`).

## Despliegue

Next.js en Vercel (o similar). El worker necesita un proceso largo: un servicio Node (Railway, Fly, Render, una VM) ejecutando `npm run worker` con las mismas variables de entorno. Varios workers en paralelo son seguros (`take_job` usa `skip locked`).
