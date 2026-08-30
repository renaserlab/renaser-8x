-- ============================================================================
-- CIRCUITO COMPARTIDO DEL MODELO (30-08-2026).
-- El cortacircuitos vivía en la memoria del proceso. En serverless cada instancia
-- arranca con el contador en cero, así que la primera petición de cada instancia
-- volvía a pagar la espera del modelo caído: medido hoy, 11,6 s solo en que Google
-- devuelva el 503. Es el mismo error que ya se corrigió en el límite de peticiones:
-- el estado tiene que ser común a todas las instancias, no de cada una.
-- ============================================================================

create table if not exists circuito (
  clave text primary key,
  fallos int not null default 0,
  cortado_hasta timestamptz,
  actualizado_at timestamptz not null default now()
);
alter table circuito enable row level security;
revoke all on circuito from anon, authenticated;

/** Anota un fallo. Al llegar al umbral abre el circuito. Devuelve si quedó abierto. */
create or replace function circuito_fallo(p_clave text, p_umbral int, p_corte_seg int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_fallos int; v_hasta timestamptz;
begin
  insert into circuito (clave, fallos) values (p_clave, 0) on conflict (clave) do nothing;
  update circuito c
     set fallos = c.fallos + 1,
         cortado_hasta = case when c.fallos + 1 >= p_umbral then now() + make_interval(secs => p_corte_seg) else c.cortado_hasta end,
         actualizado_at = now()
   where c.clave = p_clave
   returning c.fallos, c.cortado_hasta into v_fallos, v_hasta;
  -- Al abrir se reinicia la cuenta: la ventana ya protege, no hace falta seguir sumando.
  if v_fallos >= p_umbral then
    update circuito set fallos = 0 where clave = p_clave;
  end if;
  return v_hasta is not null and v_hasta > now();
end $$;

/** El principal respondió bien: el circuito se cierra de inmediato. */
create or replace function circuito_exito(p_clave text)
returns void language sql security definer set search_path = public as $$
  update circuito set fallos = 0, cortado_hasta = null, actualizado_at = now() where clave = p_clave;
$$;

/** ¿Está abierto ahora mismo? Una sola ida a la base, sin escribir. */
create or replace function circuito_abierto(p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select cortado_hasta > now() from circuito where clave = p_clave), false);
$$;

revoke execute on function circuito_fallo(text, int, int) from public, anon, authenticated;
revoke execute on function circuito_exito(text) from public, anon, authenticated;
revoke execute on function circuito_abierto(text) from public, anon, authenticated;
grant execute on function circuito_fallo(text, int, int) to service_role;
grant execute on function circuito_exito(text) to service_role;
grant execute on function circuito_abierto(text) to service_role;
