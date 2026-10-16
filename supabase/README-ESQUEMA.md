# El esquema: lo que la base tiene y lo que el repositorio describe

Fecha: 13-10-2026 · Requisito R5.2 (deriva del esquema) · Fuente: descripción OpenAPI de PostgREST de producción, leída en solo lectura.

## Por qué existe este archivo

La base de producción expone **51 relaciones y 21 funciones rpc**. Los archivos `supabase/*.sql` creaban **44 relaciones**. Las otras 7 nacieron por el SQL Editor o por scripts sueltos (`scripts/ingestar-base-maestra.mjs`) y nunca entraron al repositorio; además, 12 columnas de tablas que sí existen en el repo se añadieron en producción sin dejar rastro aquí. La auditoría del 13-10 lo registró como «7 tablas y 4 columnas sin DDL» (`clientes/8x-plan/PAQUETE-DE-DECISION-8X.md`, §E.2 n.º 13); medido columna a columna contra el OpenAPI, las columnas son 12.

Mientras ese hueco exista no se puede levantar la base en otro sitio (ni el Postgres embebido de pruebas, ni un segundo proyecto), no se pueden auditar las políticas RLS desde el código, y hay migraciones que alteran tablas que el repo no conoce (`migracion-procedencia.sql:26` añade una columna a `org_puestos`, tabla que ningún archivo creaba).

`supabase/migracion-deriva-esquema.sql` cierra el hueco. **No se ha aplicado a ninguna base.**

## Lo que faltaba y de dónde salió cada DDL

| Relación | Qué era | De dónde sale el DDL | Literal | Inferido |
|---|---|---|---|---|
| `company_metricas` | Tabla: los números de la empresa (clave, periodo, valor, estado) | OpenAPI: 12 columnas, 7 `not null`, defaults `'actual'`, `'contado'`, `now()`; FK a `companies`, `interview_responses`, `sources` | Nombres, tipos, not null, defaults escalares, PK, destinos de FK | Acciones de borrado de las FK, índice |
| `org_puestos` | Tabla: el organigrama (puestos declarados por el cliente o propuestos por la consultora) | OpenAPI: 14 columnas; `origen default 'consultor'`; FK a sí misma (`reporta_a`). Default de `fuentes_usadas` de `migracion-procedencia.sql:26` | Idem + default jsonb de `fuentes_usadas` | Acciones de borrado, índice |
| `org_estudio` | Tabla: el estudio de organigrama vigente, uno por empresa | OpenAPI: 3 columnas, PK = `company_id` | Todo lo visible | Cascada |
| `org_estudio_versiones` | Tabla: historial de estudios | OpenAPI: 4 columnas | Todo lo visible | Cascada, índice |
| `modelo_alto_rendimiento` | Tabla: la vara del rubro, una por empresa | OpenAPI: 3 columnas, PK = `company_id` | Todo lo visible | Cascada |
| `modelo_versiones` | Tabla: historial del modelo | OpenAPI: 4 columnas | Todo lo visible | Cascada, índice |
| `conocimiento_base` | Tabla: la Base Maestra troceada para el diagnosticador | `scripts/ingestar-base-maestra.mjs:11-21` (DDL completo, coincide columna a columna con el OpenAPI) | Todo, incluido `ejes text[] default '{}'` | Índice, política de consultora |
| `companies` (+5 col.) | `ficha jsonb`, `modelo_operativo text[]`, `mapa_motores jsonb`, `etapa_negocio text`, `aspiracion text` | OpenAPI (ninguna es `required`) | Nombre y tipo | Sin default (PostgREST no reporta defaults jsonb/array) |
| `company_assets` (+4 col.) | `implementacion jsonb`, `propuesta text`, `propuesta_cambios jsonb`, `propuesta_estado text` | OpenAPI | Nombre y tipo | Sin default; sin check sobre `propuesta_estado` |
| `processes` (+3 col.) | `indicador text`, `meta text`, `medicion_donde text` | OpenAPI | Nombre y tipo | — |

Las tres relaciones que parecían faltar y **no faltaban**: `company_stats` es una vista materializada (`schema.sql:449`, con su rpc `refresh_company_stats`); `claims_cliente` y `participants_cliente` son vistas con `security_barrier` (`schema.sql:686` y `:706`). Sus columnas coinciden con el OpenAPI.

## Qué queda INFERIDO y por qué

El OpenAPI de PostgREST describe lo que la API expone, no cómo está construida la tabla. No trae:

- **Acciones de borrado de las claves foráneas.** Se puso `on delete cascade` en `company_id` (patrón de todo `schema.sql`; además `src/lib/borrar-empresa.ts` no limpia estas tablas, así que sin cascada borrar una empresa con puestos fallaría) y `on delete set null` en enlaces entre iguales (`reporta_a`, `response_id`, `source_id`), siguiendo el criterio escrito en `migracion-borrado-cascada.sql`.
- **Defaults de columnas jsonb y array.** PostgREST los omite: `decisiones.evidencia` tiene `default '[]'::jsonb` en el repo y el OpenAPI lo muestra vacío. Donde el repo tenía la fuente (`fuentes_usadas`, `ejes`) se usó; donde no, la columna queda sin default.
- **Índices y restricciones check.** No se inventó ningún check. Los índices añadidos son los que pide la lectura que hace el código y van marcados.
- **Políticas RLS.** Ninguna política de producción es visible. Se siguió el patrón del repo: `consultor_todo` con `es_consultor()` en las siete tablas; para el cliente, lectura de `company_metricas` por pertenencia y de `org_puestos` solo con `origen = 'cliente'` (regla de Kelin del 27-09: el trabajo de la consultora no llega al navegador del cliente). Estudios, versiones y modelo quedan sin política de cliente, como `corrections` o `know_how`. Las políticas se crean **solo si no existen** (guarda sobre `pg_policies`), para no pisar las reales si algún día se aplica sobre producción.

## Cómo confirmarlo

1. Con un token válido de la Management API (hoy el disponible es inválido, según la auditoría), volcar el esquema en solo lectura:
   `pg_dump --schema-only --no-owner --no-privileges --schema=public "<cadena de conexión de solo lectura>" > esquema-produccion.sql`
   o, desde el SQL Editor, consultar `pg_constraint` (acciones de borrado), `pg_indexes` (índices) y `pg_policies` (políticas) para las siete tablas.
2. Comparar cada línea marcada `-- INFERIDO` en `migracion-deriva-esquema.sql` con el volcado y corregir lo que difiera. Quitar la marca solo cuando el volcado lo confirme.
3. Volver a descargar el OpenAPI (`scripts/tmp/e0-openapi.mts`, solo lectura) y regenerar el fixture saneado (`{ definitions, rpc }`, sin `host`, `basePath`, `info` ni URL alguna) con fecha nueva si la base cambió.

## Cómo se verifica desde el repo

`npx vitest run tests/deriva-esquema.test.ts` comprueba, contra el fixture `tests/fixtures/esquema-produccion-2026-10-13.json`: que cada una de las 51 relaciones tenga `create table/view` en algún `supabase/*.sql`; que cada columna aparezca en el bloque `create` de su tabla o en un `alter table ... add column`; que las 21 rpc tengan su función; que la migración sea solo aditiva (sin `drop`, `delete`, `truncate`), idempotente (`if not exists` en todo) y que lo no visible en el OpenAPI esté marcado `INFERIDO`.

La prueba se ejecuta sin conexión a ninguna base. Lo que verifica es que el repositorio describe lo que producción expone; que el DDL se comporte igual que producción (cascadas, políticas) solo lo puede confirmar el volcado del punto anterior.
