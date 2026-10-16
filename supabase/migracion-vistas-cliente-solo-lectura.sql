-- LAS VISTAS DEL CLIENTE SON PARA LEER (13-10-2026, sección 18).
--
-- schema.sql crea claims_cliente y participants_cliente y solo le quita los permisos a `public` y `anon`. En Supabase
-- los privilegios por defecto dan TODO sobre lo nuevo también a `authenticated`, y una vista de una sola tabla es
-- actualizable: un dueño con su sesión podía ESCRIBIR en participants a través de participants_cliente, saltándose
-- RLS (la vista corre como su dueño). Un verificador lo reprodujo en Postgres embebido el 13-10-2026.
-- Aquí se le quita todo a los tres roles y se concede solo leer. No toca datos. Idempotente.
revoke all on participants_cliente from public, anon, authenticated;
grant select on participants_cliente to authenticated;
revoke all on claims_cliente from public, anon, authenticated;
grant select on claims_cliente to authenticated;
