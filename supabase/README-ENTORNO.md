# ENTORNO DE PRUEBA · CÓMO SE SEPARA DE PRODUCCIÓN

Una página. Qué existe, qué falta y cómo se usa. El candado vive en `src/lib/entorno.ts`; sus pruebas, en `tests/entorno.test.ts`.

## Por qué

El 13-10-2026 la base de producción (cinco empresas reales) estaba en uso en vivo mientras se auditaba el sistema. Las pruebas de
integración, los scripts `qa` y `prueba:*` y el worker local escribían con `service_role` en esa misma base: `SUPABASE_TEST_URL` y
`NEXT_PUBLIC_SUPABASE_URL` apuntaban al mismo proyecto. Comparar dos variables no protege nada si las dos están mal.

## Qué hace el candado

`supabaseAdmin()` (el cliente que salta RLS) comprueba, una vez por proceso, **quién** escribe y **adónde**:

| Contexto | Cómo se detecta | Regla |
|---|---|---|
| `app` | Runtime de Next (Vercel, `next dev`) | Pasa como siempre. Solo rechaza `ENTORNO=prueba` con URL de producción (error de configuración) |
| `vitest` | `process.env.VITEST` | Exige `ENTORNO=prueba` o `local` **y** ref listado en `DESTINOS_PRUEBA` **y** ref distinto de producción |
| `script` | `argv[1]` (ruta absoluta, sea cual sea el cwd) con una carpeta `scripts/` o `PROPOSITO_PROCESO=script` | Igual que vitest |
| `worker` | `argv[1]` con una carpeta `worker/` o `PROPOSITO_PROCESO=worker` | Igual que vitest. Única excepción: `ENTORNO=produccion` escrito a mano **y** destino producción (`npm run worker:produccion`) |

La detección mira la ruta absoluta que entrega Node, no la relativa al cwd: `cd scripts && node tmp/x.mts` sigue siendo `script`.
Lo que viene de `node_modules` (next, vitest, tsx) es siempre `app`. Si el repo vive bajo una carpeta llamada `scripts/` o `worker/`,
un servidor propio podría caer en `script` y pedir `ENTORNO`: es el lado seguro del error, y `PROPOSITO_PROCESO` lo resuelve.

Sin `ENTORNO` en vitest/script/worker → **ambiguo**, rechazado. Ref no listado → **desconocido**, rechazado. Producción con
`ENTORNO=prueba` → rechazado aunque alguien la haya puesto en la lista. BD, Storage y Auth viven detrás de la misma URL: una comprobación
cubre las tres. El rechazo lanza `DestinoNoAutorizado` con el motivo exacto (qué variable falta o qué valor sobra).

Para **mirar** producción sin riesgo existe `supabaseSoloLectura()`: deja `from().select()` y lanza en `insert/update/upsert/delete`,
`rpc`, `storage`, `auth`, `schema`, `rest` (el PostgREST interno), `functions` y el `fetch` crudo. No pasa por el candado porque no puede
escribir. Es el cliente de los scripts de inspección. Es barandilla, no caja fuerte: quien copie la URL y la clave del objeto puede
construirse otro cliente; contra eso está el candado.

La plantilla `.env.test.example` está en el repositorio a pesar de la regla `.env*` de `.gitignore` (se añadió con `git add -f`; una vez
rastreada, la regla ya no la afecta). `.env.test`, con valores reales, sí queda fuera.

## Cómo se crea el proyecto de prueba · BLOQUEADO

Hace falta un **segundo proyecto Supabase** (misma organización, nombre `8x-prueba` o similar). Lo crea la cuenta de Kelin desde
el panel de Supabase; esta sesión no tiene esa cuenta ni Docker/CLI para levantar uno local (decisión D1 en
`clientes/8x-ejecucion/CONTINUIDAD.md`). Una vez creado:

1. Aplicar `supabase/schema.sql` y después cada `supabase/migracion-*.sql` en el editor SQL del proyecto nuevo (orden: `schema.sql`,
   luego las migraciones por fecha de commit; todas son aditivas e idempotentes).
2. Crear el bucket privado `fuentes` en Storage.
3. Copiar el ref (la parte `<ref>` de `https://<ref>.supabase.co`) y las dos claves de Settings → API.

## Cómo se llena `.env.test`

```
cp .env.test.example .env.test
```

Y se rellenan: `DESTINOS_PRUEBA=<ref>`, `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (las del proyecto de prueba), `ENTORNO=prueba` y `PRUEBAS_INTEGRACION=1` cuando se quiera que las
pruebas de integración corran de verdad. Con `PRUEBAS_INTEGRACION=1` y destino no autorizado, la suite **falla** con el motivo; con
`0` se salta con nombre `SALTADA (sin entorno de prueba): <motivo>`. Nunca se pone el ref de producción en `DESTINOS_PRUEBA`.

Para un Supabase local (cuando haya Docker): `DESTINOS_PRUEBA=local`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `ENTORNO=local`.

## Qué scripts lo usan

Otro agente de esta tanda cambia `package.json` para que `test:supabase`, `qa`, `prueba:*` y `worker` carguen `--env-file=.env.test`,
y añade `worker:produccion` (`.env.local` + `ENTORNO=produccion`), que es la única forma deliberada de atender la cola real desde una
máquina local. Hasta ese cambio, los scripts siguen cargando `.env.local`, y el candado los rechaza con «Falta ENTORNO»: es lo esperado.

## Qué NO es Supabase

`tests/sql` (otro agente) corre el SQL del repo sobre **PGlite, Postgres embebido en WASM**. Verifica que el DDL aplica, que las
funciones hacen lo que dicen y que las políticas RLS filtran. No prueba PostgREST, Auth ni Storage, no necesita red ni credenciales y
no pasa por este candado porque no toca ningún proyecto. Se rotula siempre «Postgres embebido, no Supabase».
