-- EL DUEÑO NO LEE LA DECISIÓN DE UNA LÍNEA HASTA QUE SE ACUERDA (13-10-2026, R9.3).
--
-- migracion-entrada-y-direccion.sql dejó al dueño leer lineas_producto entera (política
-- lineas_producto_cliente): con su propia sesión y por fuera de la aplicación podía pedir decision y
-- decision_motivo, que son lo que la consultora todavía está pensando sobre cada producto (retirar, reposicionar…).
-- La aplicación ya no se las manda (src/lib/producto.ts · COLUMNAS_PARA_DUENO), pero la base sí se las daba.
--
-- Mismo patrón que claims_cliente y participants_cliente (schema.sql, P0-02 y P0-04): el dueño NO lee la tabla;
-- lee una vista con las columnas que le tocan y el filtro de pertenencia dentro. La vista corre como su dueño
-- (no hereda RLS), y security_barrier evita que un predicado del cliente se evalúe antes del filtro.
--
-- Qué cambia para cada quien. Consultora: nada (su política sigue igual). Servidor (service role): nada. Dueño por
-- PostgREST: lineas_producto le devuelve cero filas; lineas_producto_cliente le devuelve las de su empresa sin
-- decisión ni motivo, y solo para leer.
--
-- No borra datos. Quita una política (la que dejaba pasar la fila entera) y crea la vista que la reemplaza.
-- Idempotente.

drop policy if exists lineas_producto_cliente on lineas_producto;

drop view if exists lineas_producto_cliente;
create view lineas_producto_cliente with (security_barrier = true) as
select
  id, company_id, codigo, nombre, tipo, cliente_objetivo, necesidad, promesa,
  precio, costo_variable_unitario, unidades_periodo, horas_por_unidad, periodo,
  origen, source_id, created_at, updated_at
from lineas_producto
where company_id in (select mis_empresas());

-- Los privilegios por defecto de Supabase dan ALL sobre lo nuevo a anon y authenticated, y una vista de una sola
-- tabla es actualizable: sin este revoke el dueño podría ESCRIBIR en lineas_producto a través de la vista, saltando
-- RLS. Se revoca todo, también a authenticated, y se concede solo leer.
revoke all on lineas_producto_cliente from public, anon, authenticated;
grant select on lineas_producto_cliente to authenticated;
