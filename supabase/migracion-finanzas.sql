-- FINANZAS DENTRO DE 8X (19-10-2026). La caja de cada empresa (lo que entra y sale, con su categoría, en soles o
-- dólares), lo que le deben (cobros), lo que paga cada mes (pagos que se repiten) y el cierre de cada mes. Prototipo
-- aprobado por Dirección el 19-10-2026; las reglas se portan del RenaserOs de una empresa (en producción), no de la
-- versión multiempresa, que se quedó atrás (suma soles con dólares y puede perder el egreso al pagar un servicio).
--
-- LA CAJA ALIMENTA A «TUS NÚMEROS» (decisión de Dirección: un solo lugar para cada número). Cada categoría dice a qué
-- número va (venta, costo variable, gasto fijo o ninguno). Un disparador recalcula, en cuanto algo cambia, las cifras
-- del mes en company_metricas (venta_mes, costo_variable_mes, gasto_fijo_mes, ganancia_mes) y las de hoy (caja_hoy,
-- deuda_clientes, deuda_propia), con origen 'caja'. Así el diagnóstico, el plan y la consultora leen lo de siempre.
-- Otro disparador hace que la caja mande: si un documento o un formulario quiere pisar una cifra que sale de la caja,
-- la caja se queda y lo otro se guarda al lado (cifra_desplazada), igual que hoy se conserva el par dueño/documento.
--
-- MONEDAS: nunca se suman soles con dólares. Los dólares de un mes entran a los números en soles solo cuando el mes se
-- cierra con su tipo de cambio y su fuente; mientras está abierto, la cifra lo dice en la nota.
--
-- Como en todo 8X, el navegador no lee ni escribe nada de esto: tablas con RLS sin políticas y sin permisos para anon
-- ni authenticated; las rutas escriben con la credencial del servidor y las funciones solo las ejecuta el servidor.
-- Solo crea y amplía el check de company_metricas.origen con 'caja'. Para deshacerlo: supabase/revertir/migracion-finanzas.sql.

-- ============ CATEGORÍAS ============

create table if not exists fin_categorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  tipo text not null check (tipo in ('ingreso','egreso')),
  destino text not null check (destino in ('venta','costo_variable','gasto_fijo','ninguno')),
  archivada boolean not null default false,          -- una categoría con movimientos se archiva, no se borra
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, tipo, nombre),
  check (tipo = 'egreso' or destino in ('venta','ninguno')),
  check (tipo = 'ingreso' or destino <> 'venta')
);

-- ============ LA CAJA ============

-- Lo que había en caja el día que se empezó a usar Finanzas: sin él, «dinero en caja hoy» no se puede saber.
create table if not exists fin_saldos_iniciales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  moneda text not null check (moneda in ('PEN','USD')),
  monto numeric(14,2) not null check (monto >= 0),
  fecha date not null,
  anulado_at timestamptz,
  motivo_anulacion text,
  registrado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists fin_un_saldo_inicial_vigente on fin_saldos_iniciales (company_id, moneda) where anulado_at is null;

create table if not exists fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('ingreso','egreso')),
  categoria_id uuid not null references fin_categorias(id),
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  detalle text,
  origen text not null default 'manual' check (origen in ('manual','cobro','pago')),
  registrado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fin_movimientos_empresa_fecha on fin_movimientos (company_id, fecha);

-- Un mes cerrado deja de moverse. Reabrirlo no borra la fila: la marca (con quién, cuándo y por qué).
create table if not exists fin_cierres (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  tipo_cambio numeric(8,4) check (tipo_cambio is null or tipo_cambio > 0),
  fuente text,
  cerrado_por uuid references users(id) on delete set null,
  cerrado_at timestamptz not null default now(),
  reabierto_at timestamptz,
  reabierto_por uuid references users(id) on delete set null,
  motivo_reapertura text,
  check (reabierto_at is null or char_length(coalesce(motivo_reapertura, '')) >= 10)
);
create unique index if not exists fin_un_cierre_vigente on fin_cierres (company_id, mes) where reabierto_at is null;

-- ============ COBROS ============

create table if not exists fin_cobros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cliente text not null check (char_length(cliente) between 1 and 160),
  concepto text,
  total numeric(14,2) not null check (total > 0),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  emitido date not null,
  vence date not null,
  categoria_id uuid not null references fin_categorias(id),   -- la categoría de ingreso con que entran sus pagos
  anulado_at timestamptz,
  motivo_anulacion text,
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (vence >= emitido)
);

-- Cada pago de un cobro tiene su ingreso en caja: el mismo par nace y muere junto (fin_registrar_pago_cobro).
create table if not exists fin_cobro_pagos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cobro_id uuid not null references fin_cobros(id) on delete cascade,
  movimiento_id uuid not null unique references fin_movimientos(id) on delete cascade,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null,
  medio text,
  registrado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ PAGOS QUE SE REPITEN ============

create table if not exists fin_pagos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  categoria_id uuid not null references fin_categorias(id),   -- la categoría de egreso con que sale de caja
  dia int not null check (dia between 1 and 31),
  proximo_vencimiento date not null,                          -- avanza solo al pagar
  activo boolean not null default true,
  motivo_baja text,
  created_at timestamptz not null default now(),
  check (activo or char_length(coalesce(motivo_baja, '')) >= 10)
);

create table if not exists fin_pagos_hechos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  pago_id uuid not null references fin_pagos_recurrentes(id) on delete cascade,
  movimiento_id uuid not null unique references fin_movimientos(id) on delete cascade,
  ciclo date not null,                                        -- el vencimiento que este pago cubrió
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null,
  registrado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pago_id, ciclo)
);

-- ============ NADA DESDE EL NAVEGADOR ============

do $$
declare t text;
begin
  foreach t in array array['fin_categorias','fin_saldos_iniciales','fin_movimientos','fin_cierres','fin_cobros','fin_cobro_pagos',
    'fin_pagos_recurrentes','fin_pagos_hechos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- ============ «TUS NÚMEROS» ADMITE LO QUE SALE DE LA CAJA ============

alter table company_metricas drop constraint if exists company_metricas_origen_check;
alter table company_metricas add constraint company_metricas_origen_check
  check (origen in ('declarado','extraido','conciliado','calculado','caja'));

-- ============ AYUDANTES ============

-- El día de hoy en el reloj de la empresa (la base corre en UTC: con current_date, de 19:00 a 24:00 de Lima ya es mañana).
create or replace function fin_hoy(p_company uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select zona_horaria from companies where id = p_company), 'America/Lima'))::date;
$$;

-- Las categorías con que arranca una empresa. Solo si todavía no tiene ninguna: después son suyas.
create or replace function fin_asegurar_categorias(p_company uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fin_categorias where company_id = p_company) then return; end if;
  insert into fin_categorias (company_id, nombre, tipo, destino, orden) values
    (p_company, 'Venta en tienda', 'ingreso', 'venta', 1),
    (p_company, 'Venta al por mayor', 'ingreso', 'venta', 2),
    (p_company, 'Otro ingreso', 'ingreso', 'ninguno', 3),
    (p_company, 'Préstamo recibido', 'ingreso', 'ninguno', 4),
    (p_company, 'Aporte del dueño', 'ingreso', 'ninguno', 5),
    (p_company, 'Mercadería e insumos', 'egreso', 'costo_variable', 1),
    (p_company, 'Fletes y envíos', 'egreso', 'costo_variable', 2),
    (p_company, 'Comisiones de venta', 'egreso', 'costo_variable', 3),
    (p_company, 'Alquiler', 'egreso', 'gasto_fijo', 4),
    (p_company, 'Sueldos y planilla', 'egreso', 'gasto_fijo', 5),
    (p_company, 'Luz, agua e internet', 'egreso', 'gasto_fijo', 6),
    (p_company, 'Contador y trámites', 'egreso', 'gasto_fijo', 7),
    (p_company, 'Publicidad', 'egreso', 'gasto_fijo', 8),
    (p_company, 'Otro gasto', 'egreso', 'gasto_fijo', 9),
    (p_company, 'Retiro del dueño', 'egreso', 'ninguno', 10),
    (p_company, 'Pago de préstamo', 'egreso', 'ninguno', 11);
end $$;

-- ============ LA CAJA MANDA EN «TUS NÚMEROS» ============

-- Escribe una cifra que sale de la caja. Si la fila tenía la cifra de un documento (extraída, sin revisar), esa se
-- conserva al lado para que la consultora vea las dos; si tenía lo que el dueño dijo de memoria, el mismo lado
-- vuelve a hablar con su registro y no hay par que conservar.
create or replace function fin_escribir_metrica(p_company uuid, p_clave text, p_periodo text, p_valor numeric, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
declare v company_metricas%rowtype;
begin
  perform set_config('fin.sincronizando', 'si', true);
  select * into v from company_metricas where company_id = p_company and clave = p_clave and periodo = p_periodo
   order by updated_at desc limit 1 for update;
  if found then
    update company_metricas set
      valor = p_valor, valor_texto = null, estado = 'contado', origen = 'caja', nota = p_nota,
      source_id = null, response_id = null, conciliado_at = null, conciliado_por = null, updated_at = now(),
      cifra_desplazada = case
        when v.origen = 'caja' then v.cifra_desplazada
        when v.estado = 'extraido' and coalesce(v.origen, 'extraido') = 'extraido' and v.valor is distinct from p_valor then
          jsonb_build_object('lado', 'extraido', 'valor', v.valor, 'valor_texto', v.valor_texto, 'nota', v.nota, 'source_id', v.source_id, 'response_id', v.response_id)
        else null end
    where id = v.id;
  else
    insert into company_metricas (company_id, clave, periodo, valor, estado, origen, nota)
    values (p_company, p_clave, p_periodo, p_valor, 'contado', 'caja', p_nota);
  end if;
  perform set_config('fin.sincronizando', '', true);
end $$;

-- Un mes que se quedó sin movimientos deja de salir de la caja: si había una cifra de documento al lado, vuelve a su
-- sitio; si no, la fila se retira (y el dueño puede volver a contarla de memoria).
create or replace function fin_retirar_metricas(p_company uuid, p_periodo text, p_claves text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v company_metricas%rowtype;
begin
  perform set_config('fin.sincronizando', 'si', true);
  for v in select * from company_metricas where company_id = p_company and periodo = p_periodo and clave = any (p_claves) and origen = 'caja' loop
    if v.cifra_desplazada ->> 'lado' = 'extraido' then
      update company_metricas set
        valor = (v.cifra_desplazada ->> 'valor')::numeric, valor_texto = v.cifra_desplazada ->> 'valor_texto',
        nota = v.cifra_desplazada ->> 'nota', source_id = (v.cifra_desplazada ->> 'source_id')::uuid,
        response_id = (v.cifra_desplazada ->> 'response_id')::uuid, estado = 'extraido', origen = 'extraido',
        cifra_desplazada = null, updated_at = now()
      where id = v.id;
    else
      delete from company_metricas where id = v.id;
    end if;
  end loop;
  perform set_config('fin.sincronizando', '', true);
end $$;

-- LAS CIFRAS DE UN MES, con la caja de ese mes. Los dólares cuentan solo con el mes cerrado y su tipo de cambio.
create or replace function fin_sincronizar_mes(p_company uuid, p_mes date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_periodo text := to_char(date_trunc('month', p_mes), 'YYYY-MM');
  v_tc numeric;
  v_hay_usd boolean;
  v_ventas numeric; v_cv numeric; v_gf numeric;
  v_nota text;
begin
  if not exists (select 1 from fin_movimientos where company_id = p_company and fecha >= v_mes and fecha < (v_mes + interval '1 month')::date) then
    perform fin_retirar_metricas(p_company, v_periodo, array['venta_mes','costo_variable_mes','gasto_fijo_mes','ganancia_mes']);
    return;
  end if;
  select tipo_cambio into v_tc from fin_cierres where company_id = p_company and mes = v_mes and reabierto_at is null;
  select exists (select 1 from fin_movimientos where company_id = p_company and moneda = 'USD' and fecha >= v_mes and fecha < (v_mes + interval '1 month')::date) into v_hay_usd;
  select
    coalesce(sum(m.monto * case when m.moneda = 'USD' then v_tc else 1 end) filter (where c.destino = 'venta'), 0),
    coalesce(sum(m.monto * case when m.moneda = 'USD' then v_tc else 1 end) filter (where c.destino = 'costo_variable'), 0),
    coalesce(sum(m.monto * case when m.moneda = 'USD' then v_tc else 1 end) filter (where c.destino = 'gasto_fijo'), 0)
  into v_ventas, v_cv, v_gf
  from fin_movimientos m join fin_categorias c on c.id = m.categoria_id
  where m.company_id = p_company and m.fecha >= v_mes and m.fecha < (v_mes + interval '1 month')::date
    and (m.moneda = 'PEN' or v_tc is not null);
  v_nota := 'De tu caja (Finanzas)' ||
    case when v_hay_usd and v_tc is null then '. Sin los dólares del mes: se suman en soles al cerrarlo con su tipo de cambio.'
         when v_hay_usd then '. Los dólares, en soles al tipo de cambio del cierre.' else '.' end;
  perform fin_escribir_metrica(p_company, 'venta_mes', v_periodo, round(v_ventas, 2), v_nota);
  perform fin_escribir_metrica(p_company, 'costo_variable_mes', v_periodo, round(v_cv, 2), v_nota);
  perform fin_escribir_metrica(p_company, 'gasto_fijo_mes', v_periodo, round(v_gf, 2), v_nota);
  perform fin_escribir_metrica(p_company, 'ganancia_mes', v_periodo, round(v_ventas - v_cv - v_gf, 2), v_nota);
end $$;

-- LAS CIFRAS DE HOY: el dinero en caja (en soles, desde el saldo inicial), lo que te deben (cobros abiertos en soles)
-- y lo que tú debes (pagos que se repiten, en soles, que vencen hasta fin de este mes). Cada una solo cuando la
-- empresa ya usa esa parte; si no, la cifra la sigue contando el dueño.
create or replace function fin_sincronizar_actual(p_company uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := fin_hoy(p_company);
  v_saldo fin_saldos_iniciales%rowtype;
  v_caja numeric; v_deben numeric; v_debes numeric;
begin
  select * into v_saldo from fin_saldos_iniciales where company_id = p_company and moneda = 'PEN' and anulado_at is null;
  if found then
    select v_saldo.monto + coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0) into v_caja
      from fin_movimientos where company_id = p_company and moneda = 'PEN' and fecha >= v_saldo.fecha and fecha <= v_hoy;
    perform fin_escribir_metrica(p_company, 'caja_hoy', 'actual', round(v_caja, 2), 'De tu caja (Finanzas): saldo inicial más lo que entró menos lo que salió, en soles.');
  else
    perform fin_retirar_metricas(p_company, 'actual', array['caja_hoy']);
  end if;

  if exists (select 1 from fin_cobros where company_id = p_company and anulado_at is null) then
    select coalesce(sum(greatest(c.total - coalesce((select sum(p.monto) from fin_cobro_pagos p where p.cobro_id = c.id), 0), 0)), 0) into v_deben
      from fin_cobros c where c.company_id = p_company and c.anulado_at is null and c.moneda = 'PEN';
    perform fin_escribir_metrica(p_company, 'deuda_clientes', 'actual', round(v_deben, 2), 'De tus cobros (Finanzas): lo que falta cobrar, en soles.');
  else
    perform fin_retirar_metricas(p_company, 'actual', array['deuda_clientes']);
  end if;

  if exists (select 1 from fin_pagos_recurrentes where company_id = p_company and activo) then
    select coalesce(sum(monto), 0) into v_debes from fin_pagos_recurrentes
     where company_id = p_company and activo and moneda = 'PEN'
       and proximo_vencimiento < (date_trunc('month', v_hoy) + interval '1 month')::date;
    perform fin_escribir_metrica(p_company, 'deuda_propia', 'actual', round(v_debes, 2), 'De tus pagos (Finanzas): lo que vence hasta fin de mes, en soles.');
  else
    perform fin_retirar_metricas(p_company, 'actual', array['deuda_propia']);
  end if;
end $$;

-- ============ DISPARADORES ============

-- Un mes cerrado no admite altas, cambios ni bajas. Se miran los DOS meses (el de antes y el de después): si no,
-- bastaría cambiarle la fecha a un movimiento para sacarlo de un mes cerrado.
-- (NEW y OLD se leen cada uno en su rama: en un DELETE no hay NEW y en un INSERT no hay OLD.)
-- BORRAR LA EMPRESA (19-10-2026, lo encontró el ensayo de la semilla demo): sus movimientos se van con ella en cascada,
-- también los de un mes cerrado y los que entraron desde un pago. Sin esta salida, una empresa que usó Finanzas no se
-- podía eliminar («El mes de 09/2026 está cerrado»). Se reconoce porque la empresa ya no está.
create or replace function fin_mes_cerrado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_nuevo date; v_viejo date; v_mes date;
begin
  if tg_op = 'DELETE' and not exists (select 1 from companies where id = old.company_id) then return old; end if;
  if tg_op in ('INSERT','UPDATE') then v_company := new.company_id; v_nuevo := date_trunc('month', new.fecha)::date; end if;
  if tg_op in ('UPDATE','DELETE') then v_company := old.company_id; v_viejo := date_trunc('month', old.fecha)::date; end if;
  select c.mes into v_mes from fin_cierres c
   where c.company_id = v_company and c.reabierto_at is null and c.mes in (v_nuevo, v_viejo)
   order by c.mes limit 1;
  if v_mes is not null then
    raise exception 'El mes de % está cerrado. Para registrar o corregir algo ahí, el dueño o el gerente tiene que reabrirlo con un motivo escrito.', to_char(v_mes, 'MM/YYYY');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists fin_movimientos_mes_cerrado on fin_movimientos;
create trigger fin_movimientos_mes_cerrado before insert or update or delete on fin_movimientos
  for each row execute function fin_mes_cerrado();

-- Lo que entró solo desde un cobro o salió solo por un pago lo manda ese pago: su fecha, su importe, su moneda y su tipo
-- no se cambian en la caja, y no se borra desde la caja (se anula el pago, que se lleva su movimiento).
create or replace function fin_movimiento_automatico() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sistema boolean := coalesce(current_setting('fin.desde_pago', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    if new.origen <> 'manual' and not v_sistema then
      raise exception 'Un movimiento de cobro o de pago lo pone el sistema al registrar el pago; no se escribe a mano.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Al borrar la empresa, todo lo suyo se va en cascada (ver fin_mes_cerrado).
    if not exists (select 1 from companies where id = old.company_id) then return old; end if;
    if old.origen <> 'manual' and not v_sistema then
      raise exception 'Este movimiento entró solo desde un %. Se retira anulando ese pago: si se borrara aquí, el pago seguiría registrado.', case when old.origen = 'cobro' then 'cobro' else 'pago que se repite' end;
    end if;
    return old;
  end if;
  -- UPDATE
  if old.origen = 'manual' then
    if new.origen <> 'manual' then
      raise exception 'Un movimiento de cobro o de pago lo pone el sistema al registrar el pago; no se escribe a mano.';
    end if;
    return new;
  end if;
  if not v_sistema and (new.fecha is distinct from old.fecha or new.monto is distinct from old.monto or new.moneda is distinct from old.moneda
     or new.tipo is distinct from old.tipo or new.origen is distinct from old.origen) then
    raise exception 'Este movimiento entró solo desde un pago: su fecha, su importe y su moneda los manda ese pago. Corrígelo allí.';
  end if;
  return new;
end $$;
drop trigger if exists fin_movimientos_automaticos on fin_movimientos;
create trigger fin_movimientos_automaticos before insert or update or delete on fin_movimientos
  for each row execute function fin_movimiento_automatico();

-- Lo que cambia en la caja se refleja en «Tus números» en el mismo momento.
-- Con la empresa borrándose no hay «Tus números» que escribir: sus cifras se van con ella (y escribir una fallaría).
create or replace function fin_al_cambiar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from companies where id = old.company_id) then return null; end if;
  if tg_op = 'INSERT' then
    perform fin_sincronizar_mes(new.company_id, new.fecha);
    perform fin_sincronizar_actual(new.company_id);
  elsif tg_op = 'DELETE' then
    perform fin_sincronizar_mes(old.company_id, old.fecha);
    perform fin_sincronizar_actual(old.company_id);
  else
    perform fin_sincronizar_mes(old.company_id, old.fecha);
    if date_trunc('month', new.fecha) <> date_trunc('month', old.fecha) or new.company_id <> old.company_id then
      perform fin_sincronizar_mes(new.company_id, new.fecha);
    end if;
    perform fin_sincronizar_actual(new.company_id);
  end if;
  return null;
end $$;
drop trigger if exists fin_movimientos_a_numeros on fin_movimientos;
create trigger fin_movimientos_a_numeros after insert or update or delete on fin_movimientos
  for each row execute function fin_al_cambiar_movimiento();

create or replace function fin_al_cambiar_cierre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from companies where id = old.company_id) then return null; end if;
  if tg_op = 'DELETE' then perform fin_sincronizar_mes(old.company_id, old.mes);
  else perform fin_sincronizar_mes(new.company_id, new.mes);
  end if;
  return null;
end $$;
drop trigger if exists fin_cierres_a_numeros on fin_cierres;
create trigger fin_cierres_a_numeros after insert or update or delete on fin_cierres
  for each row execute function fin_al_cambiar_cierre();

create or replace function fin_al_cambiar_hoy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from companies where id = old.company_id) then return null; end if;
  if tg_op = 'DELETE' then perform fin_sincronizar_actual(old.company_id);
  else perform fin_sincronizar_actual(new.company_id);
  end if;
  return null;
end $$;
drop trigger if exists fin_saldos_a_numeros on fin_saldos_iniciales;
create trigger fin_saldos_a_numeros after insert or update or delete on fin_saldos_iniciales for each row execute function fin_al_cambiar_hoy();
drop trigger if exists fin_cobros_a_numeros on fin_cobros;
create trigger fin_cobros_a_numeros after insert or update or delete on fin_cobros for each row execute function fin_al_cambiar_hoy();
drop trigger if exists fin_pagos_a_numeros on fin_pagos_recurrentes;
create trigger fin_pagos_a_numeros after insert or update or delete on fin_pagos_recurrentes for each row execute function fin_al_cambiar_hoy();

-- LA CAJA MANDA: nadie más pisa una cifra que sale de la caja. Si un documento trae otra, se guarda al lado; si un
-- formulario o una consolidación trae otra, la caja se queda (la ruta del dueño, además, ya no lo ofrece). Confirmar la
-- misma cifra (conciliarla) sí se deja.
create or replace function fin_la_caja_manda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_caja company_metricas%rowtype;
begin
  if coalesce(current_setting('fin.sincronizando', true), '') = 'si' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.origen = 'caja' and new.origen is distinct from 'caja'
       and (new.valor is distinct from old.valor or new.valor_texto is distinct from old.valor_texto) then
      new.cifra_desplazada := case when new.estado = 'extraido'
        then jsonb_build_object('lado', 'extraido', 'valor', new.valor, 'valor_texto', new.valor_texto, 'nota', new.nota, 'source_id', new.source_id, 'response_id', new.response_id)
        else old.cifra_desplazada end;
      new.valor := old.valor; new.valor_texto := old.valor_texto; new.estado := old.estado; new.origen := old.origen;
      new.nota := old.nota; new.source_id := old.source_id; new.response_id := old.response_id;
    end if;
    return new;
  end if;
  select * into v_caja from company_metricas
   where company_id = new.company_id and clave = new.clave and periodo = new.periodo and origen = 'caja' limit 1;
  if found then
    if new.estado = 'extraido' then
      update company_metricas set cifra_desplazada = jsonb_build_object('lado', 'extraido', 'valor', new.valor, 'valor_texto', new.valor_texto,
        'nota', new.nota, 'source_id', new.source_id, 'response_id', new.response_id)
      where id = v_caja.id;
    end if;
    return null;
  end if;
  return new;
end $$;
drop trigger if exists company_metricas_la_caja_manda on company_metricas;
create trigger company_metricas_la_caja_manda before insert or update on company_metricas
  for each row execute function fin_la_caja_manda();

-- ============ OPERACIONES QUE SON UNA SOLA COSA ============

-- PAGO DE UN COBRO: el pago y su ingreso en caja entran juntos o no entra ninguno.
create or replace function fin_registrar_pago_cobro(p_cobro uuid, p_monto numeric, p_fecha date, p_medio text, p_por uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c fin_cobros%rowtype;
  v_pagado numeric;
  v_mov uuid;
  v_pago uuid;
begin
  select * into c from fin_cobros where id = p_cobro for update;
  if not found then raise exception 'Ese cobro no existe.'; end if;
  if c.anulado_at is not null then raise exception 'Ese cobro está anulado: ya no recibe pagos.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El pago tiene que ser mayor que cero.'; end if;
  if p_monto <> round(p_monto, 2) then raise exception 'El pago admite como mucho dos decimales (céntimos).'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
  if p_fecha > fin_hoy(c.company_id) then raise exception 'La fecha del pago (%) es futura: se registra cuando el dinero ya entró.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
  if p_fecha < c.emitido then raise exception 'El pago (%) es anterior a la emisión del cobro (%).', to_char(p_fecha, 'DD/MM/YYYY'), to_char(c.emitido, 'DD/MM/YYYY'); end if;
  select coalesce(sum(monto), 0) into v_pagado from fin_cobro_pagos where cobro_id = p_cobro;
  if v_pagado + p_monto > c.total then
    raise exception 'Con este pago se cobraría más que el total: faltan % y se registran %.', c.total - v_pagado, p_monto;
  end if;
  perform set_config('fin.desde_pago', 'si', true);
  insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto, moneda, detalle, origen, registrado_por)
  values (c.company_id, p_fecha, 'ingreso', c.categoria_id, p_monto, c.moneda,
          'Pago de ' || c.cliente || coalesce(' · ' || c.concepto, ''), 'cobro', p_por)
  returning id into v_mov;
  insert into fin_cobro_pagos (company_id, cobro_id, movimiento_id, monto, fecha, medio, registrado_por)
  values (c.company_id, p_cobro, v_mov, p_monto, p_fecha, p_medio, p_por)
  returning id into v_pago;
  perform set_config('fin.desde_pago', '', true);
  perform fin_sincronizar_actual(c.company_id);
  return v_pago;
end $$;

-- Anular un pago de cobro se lleva su ingreso de la caja (si su mes está cerrado, el disparador lo impide).
create or replace function fin_anular_pago_cobro(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_mov uuid; v_company uuid;
begin
  select movimiento_id, company_id into v_mov, v_company from fin_cobro_pagos where id = p_pago;
  if v_mov is null then raise exception 'Ese pago no existe.'; end if;
  perform set_config('fin.desde_pago', 'si', true);
  delete from fin_movimientos where id = v_mov;           -- el pago se va con él (on delete cascade)
  perform set_config('fin.desde_pago', '', true);
  perform fin_sincronizar_actual(v_company);
end $$;

-- PAGO DE ALGO QUE SE REPITE: el egreso en caja, el registro del ciclo pagado y el próximo vencimiento, juntos.
create or replace function fin_pagar_recurrente(p_pago uuid, p_monto numeric, p_fecha date, p_por uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r fin_pagos_recurrentes%rowtype;
  v_mov uuid; v_hecho uuid; v_siguiente date; v_mes date;
begin
  select * into r from fin_pagos_recurrentes where id = p_pago for update;
  if not found then raise exception 'Ese pago no existe.'; end if;
  if not r.activo then raise exception 'Ese pago está dado de baja.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto pagado tiene que ser mayor que cero.'; end if;
  if p_monto <> round(p_monto, 2) then raise exception 'El monto admite como mucho dos decimales (céntimos).'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
  if p_fecha > fin_hoy(r.company_id) then raise exception 'La fecha del pago (%) es futura: se registra cuando el cargo ya ocurrió.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
  if exists (select 1 from fin_pagos_hechos where pago_id = p_pago and ciclo = r.proximo_vencimiento) then
    raise exception 'El vencimiento del % de «%» ya tiene su pago registrado.', to_char(r.proximo_vencimiento, 'DD/MM/YYYY'), r.nombre;
  end if;
  perform set_config('fin.desde_pago', 'si', true);
  insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto, moneda, detalle, origen, registrado_por)
  values (r.company_id, p_fecha, 'egreso', r.categoria_id, p_monto, r.moneda, 'Pago de ' || r.nombre, 'pago', p_por)
  returning id into v_mov;
  insert into fin_pagos_hechos (company_id, pago_id, movimiento_id, ciclo, monto, fecha, registrado_por)
  values (r.company_id, p_pago, v_mov, r.proximo_vencimiento, p_monto, p_fecha, p_por)
  returning id into v_hecho;
  perform set_config('fin.desde_pago', '', true);
  -- El siguiente vencimiento: el mismo día del mes que viene (o el último día, si ese mes es más corto).
  v_mes := (date_trunc('month', r.proximo_vencimiento) + interval '1 month')::date;
  v_siguiente := least(v_mes + (r.dia - 1), (v_mes + interval '1 month - 1 day')::date);
  update fin_pagos_recurrentes set proximo_vencimiento = v_siguiente where id = p_pago;
  return v_hecho;
end $$;

-- Anular el último pago hecho de algo que se repite: se lleva su egreso y devuelve el vencimiento a ese ciclo.
create or replace function fin_anular_pago_hecho(p_hecho uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h fin_pagos_hechos%rowtype;
begin
  select * into h from fin_pagos_hechos where id = p_hecho;
  if not found then raise exception 'Ese pago no existe.'; end if;
  if exists (select 1 from fin_pagos_hechos where pago_id = h.pago_id and ciclo > h.ciclo) then
    raise exception 'Solo se anula el último pago hecho: hay otro posterior.';
  end if;
  perform set_config('fin.desde_pago', 'si', true);
  delete from fin_movimientos where id = h.movimiento_id;  -- el registro del ciclo se va con él
  perform set_config('fin.desde_pago', '', true);
  update fin_pagos_recurrentes set proximo_vencimiento = h.ciclo where id = h.pago_id;
end $$;

-- CERRAR UN MES: solo uno que ya terminó, en el reloj de la empresa. Si tuvo dólares, con su tipo de cambio y de dónde
-- salió (SBS, banco…): sin eso no se pueden sumar en soles.
create or replace function fin_cerrar_mes(p_company uuid, p_mes date, p_tipo_cambio numeric, p_fuente text, p_por uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date; v_id uuid;
begin
  if v_mes >= date_trunc('month', fin_hoy(p_company))::date then
    raise exception 'Todavía no se puede cerrar %: el mes no ha terminado.', to_char(v_mes, 'MM/YYYY');
  end if;
  if exists (select 1 from fin_cierres where company_id = p_company and mes = v_mes and reabierto_at is null) then
    raise exception 'El mes de % ya está cerrado.', to_char(v_mes, 'MM/YYYY');
  end if;
  if exists (select 1 from fin_movimientos where company_id = p_company and moneda = 'USD' and fecha >= v_mes and fecha < (v_mes + interval '1 month')::date)
     and (p_tipo_cambio is null or p_tipo_cambio <= 0 or char_length(coalesce(trim(p_fuente), '')) < 3) then
    raise exception 'El mes de % tuvo dólares: para cerrarlo hace falta el tipo de cambio y de dónde salió (por ejemplo, SBS).', to_char(v_mes, 'MM/YYYY');
  end if;
  insert into fin_cierres (company_id, mes, tipo_cambio, fuente, cerrado_por)
  values (p_company, v_mes, p_tipo_cambio, nullif(trim(coalesce(p_fuente, '')), ''), p_por)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fin_reabrir_mes(p_company uuid, p_mes date, p_motivo text, p_por uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  if char_length(coalesce(trim(p_motivo), '')) < 10 then
    raise exception 'Para reabrir un mes hace falta un motivo escrito de al menos diez caracteres.';
  end if;
  update fin_cierres set reabierto_at = now(), reabierto_por = p_por, motivo_reapertura = trim(p_motivo)
   where company_id = p_company and mes = v_mes and reabierto_at is null;
  if not found then raise exception 'El mes de % no está cerrado.', to_char(v_mes, 'MM/YYYY'); end if;
end $$;

revoke all on function fin_hoy(uuid) from public, anon, authenticated;
revoke all on function fin_asegurar_categorias(uuid) from public, anon, authenticated;
revoke all on function fin_escribir_metrica(uuid, text, text, numeric, text) from public, anon, authenticated;
revoke all on function fin_retirar_metricas(uuid, text, text[]) from public, anon, authenticated;
revoke all on function fin_sincronizar_mes(uuid, date) from public, anon, authenticated;
revoke all on function fin_sincronizar_actual(uuid) from public, anon, authenticated;
revoke all on function fin_registrar_pago_cobro(uuid, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function fin_anular_pago_cobro(uuid) from public, anon, authenticated;
revoke all on function fin_pagar_recurrente(uuid, numeric, date, uuid) from public, anon, authenticated;
revoke all on function fin_anular_pago_hecho(uuid) from public, anon, authenticated;
revoke all on function fin_cerrar_mes(uuid, date, numeric, text, uuid) from public, anon, authenticated;
revoke all on function fin_reabrir_mes(uuid, date, text, uuid) from public, anon, authenticated;
grant execute on function fin_hoy(uuid) to service_role;
grant execute on function fin_asegurar_categorias(uuid) to service_role;
grant execute on function fin_escribir_metrica(uuid, text, text, numeric, text) to service_role;
grant execute on function fin_retirar_metricas(uuid, text, text[]) to service_role;
grant execute on function fin_sincronizar_mes(uuid, date) to service_role;
grant execute on function fin_sincronizar_actual(uuid) to service_role;
grant execute on function fin_registrar_pago_cobro(uuid, numeric, date, text, uuid) to service_role;
grant execute on function fin_anular_pago_cobro(uuid) to service_role;
grant execute on function fin_pagar_recurrente(uuid, numeric, date, uuid) to service_role;
grant execute on function fin_anular_pago_hecho(uuid) to service_role;
grant execute on function fin_cerrar_mes(uuid, date, numeric, text, uuid) to service_role;
grant execute on function fin_reabrir_mes(uuid, date, text, uuid) to service_role;
