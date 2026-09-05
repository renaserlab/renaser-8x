-- ============================================================================
-- SIPOC Y MADUREZ (30-08-2026). Dos huecos que Kelin encontró comparando 8X contra los marcos
-- que usa la consultoría seria.
--
-- SIPOC (Proveedor-Entrada-Proceso-Salida-Cliente) es la ficha mínima de cualquier proceso. 8X
-- capturaba responsable, tiempo, herramienta y qué lo inicia — pero NO quién entrega la entrada ni
-- quién recibe la salida. Sin esos dos campos cada proceso es una isla: se tienen 35 procesos
-- sueltos en vez de una cadena, y no se puede ver dónde se rompe el traspaso entre uno y otro,
-- que es justo donde se pierden las cosas en una empresa.
--
-- MADUREZ (CMMI 0-5) es el número que le dice al dueño que está avanzando. Se calcula, no se
-- declara: cada nivel se gana con algo comprobable en la propia base.
-- ============================================================================

-- SIPOC: los dos extremos que faltaban. `inicio` y `resultado` ya existían (la E y la S).
alter table processes add column if not exists proveedor text;   -- quién entrega la entrada
alter table processes add column if not exists cliente_proceso text; -- quién recibe la salida
-- La categoría del mapa de 13 (APQC PCF), en clave nuestra: rumbo, venta, dinero, personas…
alter table processes add column if not exists categoria text;
create index if not exists processes_categoria_idx on processes (company_id, categoria);
