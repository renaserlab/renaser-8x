# P2 · PROCESOS

**Pregunta rectora:** ¿cómo convierte la empresa recursos y trabajo en resultados repetibles, medibles y cada vez mejores?

**Reconstruye:** Área → Macroproceso → Proceso → Actividades → Resultado. Se dibuja el proceso REAL, no el ideal. Los finales malos son obligatorios: la fuga es lo que hay que ver.

## Dimensiones (código: `DIMENSIONES.procesos`)
flujo · tiempo · espera · entradas · salidas · dueño del proceso · estándar · errores · excepciones · retrabajo · dependencias · información · sistemas · capacidad · desperdicio

## Principio operativo
No se optimizan pasos aislados: optimizar un paso desplaza el problema. Se analiza el flujo completo de valor (Lean). Un agente sobre un proceso indefinido automatiza el desorden: primero se define, después se automatiza. Un paso `remove` nunca se automatiza.

## Veredicto obligatorio por proceso y por paso
keep · improve · replace · remove · create (código: `process_nodes.veredicto`, `rules/grafo.ts`)

## Validación estructural (código: `rules/grafo.ts`, conectada al guardado)
decisión ≥ 2 salidas etiquetadas · todo camino termina en un fin · final malo presente · ningún nodo inalcanzable · `remove` con consumidores aguas abajo se revisa · nada indefinido ("?") se automatiza.

## Cada nodo puede llevar
responsable · rol · ejecutor (humano/software/ia/hibrido) · herramienta · duración · espera · entrada · salida · evidencia · estándar de calidad · problema · know-how · veredicto.

## Fuentes
Descripción por voz del dueño o del equipo (ARQUITECTO) · dibujo a mano · entrevistas de primera línea ("cuando el procedimiento dice X, ¿qué hacen?") · know-how.
