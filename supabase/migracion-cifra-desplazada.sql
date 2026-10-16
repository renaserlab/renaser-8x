-- LO QUE DIJO EL DUEÑO Y LO QUE DICE SU EXCEL TIENEN QUE PODER ESTAR LOS DOS (13-10-2026, secciones 10 y 19).
--
-- company_metricas guarda una fila por clave y periodo. Cuando llega el Excel, su cifra pisa la que declaró el
-- dueño (y al revés): el par nunca existe a la vez, y el contraste «como 40.000» frente a 79.782 no se puede hacer
-- en producto aunque la regla esté escrita (src/lib/rules/contradiccion-numerica.ts). Esta columna conserva la cifra
-- del otro lado que una escritura desplaza: { lado: declarado|extraido, valor, valor_texto, nota, response_id, source_id }.
-- Quien guarda la arma con conCifraDesplazada(). Aditiva: una columna; nada se borra ni se renombra.
alter table company_metricas add column if not exists cifra_desplazada jsonb;
comment on column company_metricas.cifra_desplazada is 'la cifra del otro lado (declarado/extraído) que esta fila pisó; permite contrastar sin perder ninguna';
