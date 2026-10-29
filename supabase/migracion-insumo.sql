-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESTADO «INSUMO» · 20-10-2026
--
-- POR QUÉ. El 19-10 se midió la biblioteca completa del primer cliente y el revisor devolvió que
-- cuatro de sus documentos no son documentos. Los nombró: «borrador fragmentado de guía operativa y
-- apuntes», «listado informal de funciones», «transcripción de entrevista sobre prácticas
-- laborales». Eso es lo que la dueña contó y lo que el personal dictó: materia prima.
--
-- Hasta hoy el expediente solo sabía decir «medido» o «sin medir», así que la transcripción de una
-- entrevista se contaba como un entregable que falló su vara. Es injusto con el documento, ensucia
-- el tablero y hace que un activo parezca cubierto por algo que no lo cubre.
--
-- Un insumo no se mide, no cuenta como entregable y no tapa ningún activo. Pero no se esconde:
-- quien vaya a construir ese activo tiene que leerlo, porque ahí está lo que la empresa hace hoy.
--
-- NO BORRA NADA. Se puede correr dos veces sin dano.
--
-- SIN `begin`/`commit` PROPIOS, como el resto de las migraciones de esta carpeta: quien la aplica
-- la envuelve en una sola transaccion con las demas de su tanda. Una migracion que abre la suya
-- deja dos transacciones anidadas y el `commit` de adentro cierra la de afuera antes de tiempo.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · El estado entra en la lista de los conocidos
--
-- Se rehace el check entero en vez de añadirle un valor porque un check no se amplía: se
-- reemplaza. El orden de los valores es el del camino del documento, y «insumo» va al final
-- porque no está en ese camino: es una salida lateral, no un paso.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table expediente_documental drop constraint if exists expediente_estado_conocido;
alter table expediente_documental add constraint expediente_estado_conocido
  check (estado in ('recibido', 'borrador', 'en_revision', 'aprobado', 'vigente', 'sustituido', 'archivado', 'insumo'));

comment on column expediente_documental.estado is
  'Dónde está el documento en su camino: recibido → borrador → en_revision → aprobado → vigente, y de ahí a sustituido o archivado. «insumo» está fuera de ese camino a propósito: es material que la empresa aportó y que no es un entregable —una transcripción, unos apuntes, un listado informal—. No se mide contra ninguna vara, no cubre ningún activo, y se lee antes de escribir el documento que sí corresponde.';

-- ──────────────────────────────────────────────────────────────────────────────────────────────────
-- LOS DATOS VAN APARTE, Y NO ES UNA FORMALIDAD
--
-- Marcar qué documento de qué empresa es un insumo, y a qué vara apunta cada uno, son DATOS. Esto
-- es ESQUEMA. Mezclarlos aquí hace que una migración que promete no tocar un solo dato existente
-- lo toque, y esa promesa es justamente la que deja aplicarla sin miedo.
--
-- Lo del primer cliente vive en `clientes/8x-produccion/biblioteca-por-tipo-de-documento.sql`, que es donde
-- la casa guarda lo que se le aplica a una empresa concreta.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────
