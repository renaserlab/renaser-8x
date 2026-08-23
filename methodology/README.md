# /methodology — el método en texto, sincronizado con el código

| Archivo | Qué contiene | Código que lo implementa |
|---|---|---|
| `people.md` | P1 Personas: dimensiones, preguntas, señales, patrones | `rules/patrones.ts` DIMENSIONES.personas · `rules/cobertura.ts` bloques personas/lider/personal |
| `process.md` | P2 Procesos: veredictos, validación, campos de nodo | `rules/grafo.ts` · `process_nodes` |
| `product.md` | P3 Producto/Servicio | `DIMENSIONES.producto` · `rules/evidencia.ts` (datos = fuente fuerte) |
| `marketing.md` | P4 Marketing | `DIMENSIONES.marketing` · patrón canal_unico |
| `purpose.md` | Filtro Propósito | `schemas` filtros · `rules/evidencia.ts` aplicarFiltros |
| `wisdom.md` | Filtro Sabiduría | ídem + prompt AUDITOR |
| `excellence.md` | Filtro Excelencia | ídem · `sops.estandar` |
| `references.md` | Los referentes como lentes (nunca visibles al cliente) | `rules/patrones.ts` LENTES |

Regla central: **conocimiento externo = lente para investigar; evidencia interna = prueba para concluir.**
Test de sincronía: `tests/metodologia.test.ts` comprueba que cada referente y cada dimensión listados aquí existen en el código, y que ningún nombre de referente aparece en textos visibles al cliente.
