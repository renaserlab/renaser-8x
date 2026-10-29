-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- DE DÓNDE SALIÓ ESTA ACCIÓN · 28-10-2026
--
-- POR QUÉ. Aprobar una estrategia no escribía NADA en el plan. La estrategia aprobada guarda, dentro de
-- su propia fila, las victorias de los primeros 14 días (qué, quién, desde qué día, con su cuenta), las
-- jugadas del camino elegido y los números que hay que medir desde el día 1. Todo eso se quedaba como
-- JSON y la tabla `actions` seguía vacía: la dueña veía dos planes sin relación, el camino aprobado
-- arriba y «las acciones en marcha» abajo, que venían de otro sitio.
--
-- Para bajarlas al plan hacen falta dos cosas que la base no tenía: saber DE QUÉ ESTRATEGIA viene cada
-- acción, y poder aprobar la misma estrategia dos veces (o aprobar su actualización) sin que se dupliquen.
--
-- QUÉ AÑADE. Dos columnas a `actions` y dos a `indicadores`: la estrategia de la que nacieron y su
-- referencia dentro de ella («v.1» es la primera victoria; «b.J3», la tercera jugada del camino B). Con
-- un índice único sobre las tres, bajar la misma estrategia otra vez no crea una segunda fila: la que
-- ya está se queda como está, con las correcciones que la consultora le haya hecho encima.
--
-- Lo escrito a mano o por el planificador deja las dos columnas en nulo, y el índice no lo mira: una
-- empresa puede tener muchas acciones sin estrategia y ninguna choca con otra.
--
-- NO BORRA NADA Y NO TOCA UN SOLO DATO. Se puede correr dos veces sin daño.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

-- `on delete set null` y no `cascade`: si algún día se borrara una estrategia, la acción que salió de ella
-- NO desaparece del plan. Puede estar en ejecución, reportada o verificada, con su historial y su prueba.
-- Lo que se pierde es de dónde vino, no el trabajo.
alter table actions add column if not exists estrategia_id uuid references estrategias(id) on delete set null;
alter table actions add column if not exists estrategia_ref text;

alter table indicadores add column if not exists estrategia_id uuid references estrategias(id) on delete set null;
alter table indicadores add column if not exists estrategia_ref text;

-- El candado de la duplicación. Parcial: solo mira las filas que de verdad vienen de una estrategia.
create unique index if not exists actions_estrategia_ref_idx
  on actions (company_id, estrategia_id, estrategia_ref)
  where estrategia_id is not null and estrategia_ref is not null;

-- Los indicadores ya tienen `unique (company_id, clave)`, que impide dos con la misma clave. Este índice
-- es para lo otro: que la misma pieza de la misma estrategia no entre dos veces aunque la clave cambie.
create unique index if not exists indicadores_estrategia_ref_idx
  on indicadores (company_id, estrategia_id, estrategia_ref)
  where estrategia_id is not null and estrategia_ref is not null;

comment on column actions.estrategia_ref is
  'De qué pieza de la estrategia salió esta acción: «v.1» la primera victoria de los 14 días, «a.J2» la segunda jugada del camino A. Nulo si la escribió una persona o el planificador.';

comment on column indicadores.estrategia_ref is
  'De qué pieza de la estrategia salió este número: «m.1» el primero de «medir desde el día 1». Nulo si lo creó una persona o salió de una incidencia.';
