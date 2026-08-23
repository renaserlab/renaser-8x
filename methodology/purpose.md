# Filtro 1 · PROPÓSITO

¿Para qué merece existir esta empresa además de producir dinero? No se acepta una misión bonita: ¿qué cambia en la vida de las personas porque esta empresa existe? ¿Cómo lo demuestran?

## Preguntas que toda recomendación debe pasar (código: `schemas` filtros.proposito · `rules/evidencia.ts` aplicarFiltros · prompt DIAGNOSTICADOR)
1. ¿Contradice algo esencial que la empresa decidió preservar?
2. ¿Genera dinero destruyendo el propósito declarado?
3. ¿Contradice la empresa (o la vida) que el dueño decidió construir?

**Regla dura:** una recomendación que multiplica ingresos destruyendo al dueño o vaciando el propósito se marca `no_pasa` y **no se emite**; en su lugar se registra la tensión (`findings.filtros.tension`). El motivo de corrección `contradice_filtro_proposito` existe para cuando el consultor detecta que el filtro falló.

## Fuente del propósito
La sesión `sueno_dueno` (origen, éxito, qué no sacrificar) y la sesión `empresa_dueno` (bloque propósito). Sin esas respuestas, el filtro no puede evaluarse y el hallazgo debe marcar información insuficiente, no suponer.
