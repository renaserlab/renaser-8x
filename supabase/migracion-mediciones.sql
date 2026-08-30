-- ============================================================================
-- MEDICIONES: LA LÍNEA BASE Y LOS CORTES (30-08-2026).
--
-- Hasta hoy no había forma de responder "¿funcionó lo que hicimos?". Los diagnósticos eran una foto
-- única (4 por empresa, todos del mismo día) y los cortes de control guardaban sus indicadores como
-- TEXTO LIBRE, sin conexión con los números: aunque se hiciera un corte, nada podía calcular si el
-- indicador se movió.
--
-- Una medición es una foto CONGELADA de los nueve vitales con su fecha. La primera es la línea base
-- —el "antes"—; cada corte posterior es un "después" que se compara contra ella. Se congelan también
-- los derivados (margen, equilibrio, días de aguante) para que la historia siga siendo honesta
-- aunque mañana cambie la fórmula.
-- ============================================================================

create table if not exists mediciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tipo text not null check (tipo in ('linea_base', 'corte')),
  numero int not null default 0,          -- 0 para la línea base; 1, 2, 3… para los cortes
  fecha date not null default current_date,
  valores jsonb not null default '{}'::jsonb,    -- { venta_mes: 40000, ganancia_mes: 4000, … }
  derivados jsonb not null default '{}'::jsonb,  -- margen, equilibrio, dias_aguante al momento
  nota text,
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mediciones_empresa_idx on mediciones (company_id, tipo, numero);
create index if not exists mediciones_fecha_idx on mediciones (company_id, fecha desc);

-- Una sola línea base por empresa: si hubiera dos, "el antes" dejaría de significar algo.
create unique index if not exists mediciones_una_base on mediciones (company_id) where tipo = 'linea_base';

alter table mediciones enable row level security;
drop policy if exists mediciones_cliente on mediciones;
create policy mediciones_cliente on mediciones for select using (company_id in (select mis_empresas()));
drop policy if exists mediciones_consultor on mediciones;
create policy mediciones_consultor on mediciones for all using (es_consultor()) with check (es_consultor());
revoke insert, update, delete on mediciones from anon, authenticated;

-- El corte cualitativo que ya existía (qué se hizo, qué se trabó, qué regresó) se queda: lo que le
-- faltaba eran los números. Aquí se enlazan, en vez de tener dos historias separadas.
alter table checkpoints add column if not exists medicion_id uuid references mediciones(id) on delete set null;

/**
 * Congela una medición. Para un corte, el número sale solo del último. Devuelve la fila creada.
 * Que sea una función y no un insert suelto evita dos cortes con el mismo número en paralelo.
 */
create or replace function congelar_medicion(
  p_company uuid, p_tipo text, p_valores jsonb, p_derivados jsonb, p_nota text, p_por uuid
) returns mediciones
language plpgsql security definer set search_path = public as $$
declare v_num int; v_fila mediciones;
begin
  if p_tipo not in ('linea_base', 'corte') then raise exception 'tipo de medición no válido'; end if;

  if p_tipo = 'linea_base' then
    -- Volver a congelar la línea base reemplaza la anterior: el "antes" es uno solo, y si el
    -- diagnóstico se rehace, el punto de partida cambia con él.
    delete from mediciones m where m.company_id = p_company and m.tipo = 'linea_base';
    v_num := 0;
  else
    select coalesce(max(m.numero), 0) + 1 into v_num
      from mediciones m where m.company_id = p_company and m.tipo = 'corte';
  end if;

  insert into mediciones (company_id, tipo, numero, valores, derivados, nota, creado_por)
  values (p_company, p_tipo, v_num, coalesce(p_valores, '{}'::jsonb), coalesce(p_derivados, '{}'::jsonb), p_nota, p_por)
  returning * into v_fila;
  return v_fila;
end $$;

revoke execute on function congelar_medicion(uuid, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function congelar_medicion(uuid, text, jsonb, jsonb, text, uuid) to service_role;
