-- ============================================================================
-- LO MÍNIMO DEL ENTORNO SUPABASE QUE EL SQL DEL REPOSITORIO DA POR HECHO.
--
-- Postgres embebido (PGlite), NO Supabase. Este archivo se aplica antes que schema.sql para que el SQL
-- del repo encuentre lo que en Supabase ya existe al crear un proyecto: los tres roles de PostgREST,
-- el esquema `auth` con su tabla de usuarios y sus funciones, el esquema `storage` con sus dos tablas
-- y `foldername()`, y la publicación de Realtime.
--
-- QUÉ NO ES. No es Supabase: aquí no hay PostgREST, ni Auth (GoTrue), ni Storage API. `auth.uid()` lee
-- la misma variable de sesión que en Supabase (`request.jwt.claims`), pero quien la rellena es la
-- prueba con `set_config`, no un JWT verificado. Lo que se demuestra con esto es que el SQL aplica, que
-- las funciones hacen lo que dicen y que las políticas RLS filtran. Nada más.
--
-- QUÉ SE IMITA Y CON QUÉ FIDELIDAD.
--   · Roles: `anon`, `authenticated`, `service_role` como en Supabase (nologin, noinherit) y
--     `service_role` con BYPASSRLS, que es lo que hace que el worker y las rutas salten RLS.
--   · Privilegios por defecto: Supabase concede ALL sobre tablas, secuencias y funciones de `public` a
--     los tres roles. Sin esto, `set local role authenticated` fallaría por permisos antes de que RLS
--     pudiera filtrar nada, y los `revoke` del repo no tendrían qué revocar.
--   · `auth.uid()`, `auth.role()`, `auth.jwt()`: definición equivalente a la de Supabase.
--   · `storage.foldername()`: misma lógica (trozos de la ruta menos el último).
--   · pgcrypto: PGlite no la trae de serie; se carga como extensión al crear la instancia
--     (tests/sql/aplicar.ts). Así `create extension if not exists pgcrypto` de schema.sql:6 aplica.
--
-- Idempotente: se puede aplicar dos veces sobre la misma instancia.
-- ============================================================================

-- ---------- ROLES ----------
-- `create role` no admite `if not exists`; se consulta el catálogo.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin noinherit bypassrls';
  end if;
end $$;

-- ---------- PRIVILEGIOS POR DEFECTO EN public (como los deja Supabase) ----------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------- ESQUEMA auth ----------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Solo las columnas que el repo lee: handle_new_user() usa id, email y raw_user_meta_data->>'nombre'.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz default now()
);

-- Quién es el usuario de la petición. En Supabase PostgREST pone `request.jwt.claims` desde el JWT;
-- aquí lo pone la prueba. Si no hay nada puesto, devuelve null (como un anónimo).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- ---------- ESQUEMA storage ----------
-- schema.sql crea el bucket 'fuentes', dos políticas sobre storage.objects y archivos_de_empresa().
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Las carpetas de una ruta: 'empresa/archivo.pdf' → {empresa}. Misma lógica que la de Supabase.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _partes text[];
begin
  select string_to_array(name, '/') into _partes;
  return _partes[1:array_length(_partes, 1) - 1];
end $$;

-- ---------- REALTIME ----------
-- schema.sql añade tablas a esta publicación dentro de un `do` que solo captura duplicate_object:
-- si la publicación no existiera, el error sería undefined_object y el esquema no aplicaría.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;
