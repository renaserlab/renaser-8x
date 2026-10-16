-- EL DUEÑO NO PUEDE DARSE POR VERIFICADO A SÍ MISMO ESCRIBIENDO DIRECTO EN LA BASE (13-10-2026, secciones 12 y 18).
--
-- schema.sql creó la política `cliente_actions_upd`: cualquier miembro de la empresa podía hacer UPDATE de CUALQUIER
-- columna de sus acciones hablando directo con la base (la clave pública del navegador más su sesión), sin pasar por la
-- aplicación. Un verificador lo reprodujo en Postgres embebido: como dueño dejó una acción en estado «verificado», con
-- fecha de verificación y como prioridad, sin prueba, sin autoridad y sin una sola fila de historial. Toda la regla del
-- plan (propuesto → aprobado → en ejecución → reportado → verificado; reportado no es verificado; límite de frentes;
-- quién decidió qué) vive en la aplicación y esta política la dejaba sin efecto.
--
-- Ninguna pantalla escribe en `actions` desde el navegador: todo pasa por las rutas de la aplicación, que escriben con
-- la credencial del servidor. Por eso retirar la política no le quita nada a nadie. El dueño sigue pudiendo LEER sus
-- acciones (política `cliente_actions`, intacta). No se toca ningún dato: solo se retira un permiso.
-- Para deshacerlo: volver a crear la política con la sentencia de schema.sql (línea «create policy cliente_actions_upd»).
drop policy if exists cliente_actions_upd on actions;

-- Segunda cerca, por si alguien vuelve a crear una política amplia: el rol del navegador no tiene permiso de escritura
-- sobre la tabla. La credencial del servidor (service_role) no se ve afectada.
revoke insert, update, delete on actions from anon, authenticated;
revoke insert, update, delete on accion_historial from anon, authenticated;
