/**
 * CREA EL METHOD VAULT DE 8X.
 *
 * Uso: node --import=tsx scripts/crear-method-vault.mts [ruta]
 * Por defecto: C:/Users/Usuario/Documents/8X-METHOD-VAULT
 *
 * TRES DECISIONES DE DISEÑO, Y SU PORQUÉ:
 *
 * 1. VIVE FUERA DEL REPOSITORIO. El manual maestro (§25) lo prohíbe expresamente: «No incluir
 *    bóveda en Git». La metodología es el activo de la consultora; el repositorio se clona, se
 *    despliega y —como quedó demostrado esta semana— se puede comprometer.
 *
 * 2. CADA NOTA DECLARA SU CLASIFICACIÓN. CROWN_JEWEL no sale nunca al runtime. Un agente solo
 *    consume lo que está en RUNTIME y aprobado. Sin esa marca, «conectar Obsidian» significa que
 *    cualquier agente manda la metodología completa al proveedor del modelo en cada llamada.
 *
 * 3. RUNTIME NO SE ESCRIBE A MANO. Nace de curar una nota INTERNAL y aprobarla. Así la bóveda
 *    maestra y el paquete operativo no se desincronizan sin que nadie se entere.
 *
 * Es idempotente: no pisa una nota que ya exista.
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const RAIZ = process.argv[2] ?? "C:/Users/Usuario/Documents/8X-METHOD-VAULT";
const HOY = "2026-09-27";

type Nota = { ruta: string; clasificacion: string; titulo: string; estado: string; cuerpo: string };

const frontmatter = (n: Nota) =>
  [
    "---",
    `titulo: ${n.titulo}`,
    `clasificacion: ${n.clasificacion}`,
    `estado: ${n.estado}`,
    "version: 1.0",
    `fecha: ${HOY}`,
    "aprobado_por:",
    "agentes_autorizados: []",
    "---",
    "",
  ].join("\n");

const NOTAS: Nota[] = [
  // ───────────────────────── CROWN JEWEL: no sale nunca al runtime
  {
    ruta: "01-CROWN-JEWEL/metodo-8x.md",
    titulo: "El método 8X",
    clasificacion: "CROWN_JEWEL",
    estado: "borrador",
    cuerpo: `# El método 8X

> **Esta nota es CROWN_JEWEL.** No se entrega a ningún agente, no se sube a ningún proveedor y no
> entra al paquete operativo. Lo que los agentes consumen son derivados aprobados en \`03-RUNTIME\`.

## Qué hace 8X

Transforma empresas que dependen de la improvisación, del fundador y de personas concretas en
sistemas simples, medibles y dirigibles.

**La documentación es consecuencia del diseño, nunca el producto.** Un documento que no produzca
claridad, control, velocidad o resultado se cuestiona.

## La secuencia de intervención

Antes de agregar cualquier cosa, se recorre en este orden:

1. Identificar el resultado prioritario
2. **Eliminar** lo que no aporta
3. **Simplificar**
4. **Optimizar** lo útil
5. **Automatizar** donde haya beneficio comprobable
6. **Redistribuir** capacidad
7. **Entrenar**
8. **Incorporar o contratar** cuando se justifique
9. **Medir**
10. **Intervenir y volver a medir**

Automatizar un proceso que debería desaparecer es automatizar el desorden.

## El principio 90/10

Pareto es el punto de partida; 8X busca **el 10% que explica la mayor parte del resultado**.

Es un criterio de foco, no una proporción que haya que forzar en los datos. Y no se elimina una
actividad por pertenecer al 90%: puede ser regulatoria, habilitadora, protectora o estratégica.

## Qué se mide

Nunca «entregamos N documentos». Siempre **antes contra después**: tiempo, ventas, conversión,
margen, capacidad, errores, dependencia del dueño, tiempo de respuesta, rentabilidad, experiencia.

## PENDIENTE DE KELIN

- [ ] El criterio propio que distingue a RENASER de cualquier consultora que use IA
- [ ] Los casos donde el método NO aplica
- [ ] Qué se preserva siempre, pase lo que pase
`,
  },
  {
    ruta: "01-CROWN-JEWEL/reglas-de-la-casa.md",
    titulo: "Las reglas que no se rompen",
    clasificacion: "CROWN_JEWEL",
    estado: "borrador",
    cuerpo: `# Las reglas que no se rompen

Estas reglas están implementadas en el código de 8X y vigiladas por pruebas. No son aspiraciones.

## Nada se inventa

Si el cliente no lo dijo, el campo va vacío. Es preferible un proceso con huecos honestos que uno
completo a medias inventado: **los huecos se preguntan, lo inventado se cree.**

Jamás se deduce un responsable por el cargo, ni un tiempo «razonable», ni una herramienta habitual
del rubro.

## Un benchmark nunca es un hecho de esta empresa

Los referentes y el conocimiento del sector sirven para **preguntar** y generar hipótesis.
Solo la evidencia interna sirve para **afirmar**.

## Nada falla en silencio

Un error que no se ve es peor que uno que se ve. Si algo no se pudo hacer, se dice — con palabras
que el dueño entienda y con el siguiente paso.

## Los ejemplos nunca van dentro de la caja de respuesta

Van como marca de agua. Un ejemplo escrito como contenido hace creer al dueño que el sistema
inventó datos de su empresa. Pasó, y no vuelve a pasar.

## El cliente nunca escucha la jerga

Ni los nombres de los referentes, ni «Competing Values», ni «Porter», ni «APQC». Esas palabras
viven adentro. Al dueño se le habla de su empresa.

## La ausencia de registro no es ausencia de funcionamiento

Y al revés: que algo esté configurado no prueba que funcione. Un flujo diseñado no es un flujo
ejecutado.

## PENDIENTE DE KELIN

- [ ] Las reglas de trato con el cliente que aún no están escritas
- [ ] Qué hace RENASER cuando un cliente pide algo que el método desaconseja
`,
  },

  // ───────────────────────── INTERNAL: criterio de la consultora
  {
    ruta: "02-INTERNAL/marcos/los-cinco-marcos.md",
    titulo: "Los cinco marcos anclados",
    clasificacion: "INTERNAL",
    estado: "revisado",
    cuerpo: `# Los cinco marcos anclados

Están implementados en 8X, no solo citados. Cada uno con su archivo en el código.

| Marco | Para qué | Dónde vive |
|---|---|---|
| **APQC PCF** | Clasificar cualquier proceso de cualquier industria en 13 categorías | \`src/lib/pcf.ts\` |
| **SIPOC** | Que un proceso deje de ser una isla: quién entrega lo que lo inicia y quién recibe el resultado | agente arquitecto + ficha de proceso |
| **CMMI** | Poner número al avance: 5 niveles de madurez, cada uno ganado con algo comprobable | \`src/lib/madurez.ts\` |
| **Competing Values** | Describir la cultura real sin etiquetar por rubro | \`src/lib/rules/cultura.ts\` |
| **Cadena de valor (Porter)** | Ver dónde se pierde el valor ENTRE eslabones, no dentro | \`src/lib/rules/cadena-valor.ts\` |

## La regla común

Los cinco están traducidos al castellano del dueño y **guardan su nombre académico solo para
trazabilidad interna**. Un dueño de pollería no tiene por qué entender «Manage Enterprise Risk,
Compliance, Remediation and Resiliency».

## Lo que aporta cada uno y el anterior no

- APQC dice **dónde** cae un proceso. SIPOC dice **con qué se enlaza**.
- CMMI dice **qué tan maduro** está. Ninguno de los dos lo decía.
- Competing Values dice **cómo es la empresa**, que explica por qué un proceso correcto no se cumple.
- La cadena de valor dice **dónde se rompe el traspaso**, que es donde se pierde el dinero y ningún
  mapa de procesos por área muestra.

## PENDIENTE DE KELIN

- [ ] Si falta algún marco que uses y no esté aquí
- [ ] Qué marco usas primero cuando entra una empresa nueva
`,
  },
  {
    ruta: "02-INTERNAL/estandares/nueve-numeros-vitales.md",
    titulo: "Los nueve números vitales",
    clasificacion: "INTERNAL",
    estado: "revisado",
    cuerpo: `# Los nueve números vitales

El vocabulario canónico. **Sin claves fijas no se puede cerrar una radiografía, ni armar la serie
por meses, ni congelar una línea base, ni comparar un corte.**

Vive en \`src/lib/metricas.ts\`. Cada número trae su pregunta hablada, su unidad, si es mensual, y
hacia dónde es mejorar.

## Por qué existe esta nota

Antes de fijarlos, el extractor inventaba claves libres (\`ganancia_mes_western_union\`) y una
empresa acabó con 18 números de los que solo 3 eran vitales. Con eso no se puede medir nada.

## La regla de «mejor si»

Cada número declara si mejora subiendo, bajando o si depende del contexto. Sin eso, bajar la deuda
se leería como retroceso y subir el gasto fijo como avance.

## PENDIENTE DE KELIN

- [ ] Si algún rubro necesita un décimo número
- [ ] Los rangos de referencia por tipo de negocio, curados por ti
`,
  },
  {
    ruta: "02-INTERNAL/estandares/estandar-de-proceso.md",
    titulo: "Qué hace bueno a un proceso levantado",
    clasificacion: "INTERNAL",
    estado: "revisado",
    cuerpo: `# Qué hace bueno a un proceso levantado

**El detalle es el trabajo.** Un proceso mal descrito no sirve para nada.

## De cada paso se recoge lo que la persona haya dicho

- quién lo hace (responsable)
- con qué (herramienta)
- cuánto tarda (tiempo)
- qué recibe y qué entrega (entrada / salida)
- cómo se sabe que quedó bien (estándar)
- qué prueba queda (evidencia)
- qué se traba ahí (problema)

Los tiempos importan especialmente: «eso toma como diez minutos» va en el campo tiempo, con SUS
palabras.

## Y nada se inventa

Si no lo dijo, el campo va en null.

## Todo camino termina en un final

Incluidos los malos: «lead perdido», «cliente se va», «fruta devuelta». **La fuga es justo lo que
hay que ver**, y omitirla por incómoda vacía el ejercicio.

## La cadena (SIPOC)

Además de qué lo inicia y con qué termina: **quién entrega** eso que lo inicia y **quién recibe** el
resultado. Sin esos dos, cada proceso es una isla y no se ve dónde se rompe el traspaso.

## PENDIENTE DE KELIN

- [ ] Los 20 rangos de tiempo y costo curados que mencionaste
`,
  },

  // ───────────────────────── GOLD STANDARD
  {
    ruta: "04-GOLD-STANDARD/LEEME.md",
    titulo: "Ejemplos buenos y malos, con su porqué",
    clasificacion: "INTERNAL",
    estado: "borrador",
    cuerpo: `# Ejemplos buenos y malos

El manual (§65) pide, para cada tipo de entregable: un ejemplo **BUENO**, uno **MALO** y el
**PORQUÉ** de cada uno.

Esto es lo que permite que el sistema aprenda de tu criterio en vez de del promedio de internet.

## Cómo se guarda cada par

\`\`\`
04-GOLD-STANDARD/
  organigrama/
    bueno.md      ← un organigrama que sí sirve, con su porqué
    malo.md       ← uno que parece correcto y no sirve, con su porqué
  sop/
  manual-funciones/
  plan-estrategico/
\`\`\`

## La marca de Kelin

Cada ejemplo lleva en su frontmatter uno de: \`USAR\`, \`MODIFICAR\`, \`NO_USAR\`.

## PENDIENTE DE KELIN

- [ ] Los dos PDFs de identidad y cultura que entregaste son candidatos a BUENO. Falta tu porqué:
      qué los hace buenos, y qué versión anterior descartaste y por qué.
`,
  },

  // ───────────────────────── RUNTIME (se genera por curación)
  {
    ruta: "03-RUNTIME/LEEME.md",
    titulo: "El paquete que consumen los agentes",
    clasificacion: "INTERNAL",
    estado: "revisado",
    cuerpo: `# El paquete operativo

**Aquí NO se escribe a mano.** Cada nota de esta carpeta nace de curar una nota \`INTERNAL\` y
aprobarla explícitamente.

## Por qué

Si la bóveda maestra y el paquete operativo se editaran por separado, se desincronizarían sin que
nadie se enterara, y los agentes acabarían trabajando con una versión que nadie revisó.

## Qué puede entrar

Solo lo que cumple las tres condiciones:

1. Clasificación \`RUNTIME\`
2. Estado \`aprobado\`
3. Lista explícita de qué agentes pueden leerlo

Lo que no cumple las tres, **no se entrega a ningún agente**, aunque esté escrito.

## Lo que nunca entra

Ninguna nota \`CROWN_JEWEL\`. Ni un fragmento.
`,
  },

  // ───────────────────────── PLANTILLA
  {
    ruta: "_plantillas/nota.md",
    titulo: "Plantilla de nota",
    clasificacion: "INTERNAL",
    estado: "revisado",
    cuerpo: `# Plantilla

Copia este archivo para una nota nueva. El frontmatter es obligatorio: sin él, el Gateway no sabe
si puede entregarla a un agente y **por defecto la deniega**.

## Clasificaciones

| Marca | Qué es | Llega a un agente |
|---|---|---|
| \`CROWN_JEWEL\` | Metodología maestra | **Nunca** |
| \`INTERNAL\` | Criterio interno de la consultora | Solo si se cura a RUNTIME |
| \`RUNTIME\` | Aprobado para que lo consuman los agentes | Sí, si está aprobado |
| \`CLIENT\` | Información de una empresa concreta | Solo a agentes de esa empresa |
| \`PUBLIC\` | Puede salir | Sí |

## Estados

\`borrador\` → \`revisado\` → \`aprobado\`

Solo \`aprobado\` llega al runtime.
`,
  },
];

const INDICE = `---
titulo: Índice del Method Vault de 8X
clasificacion: INTERNAL
estado: revisado
version: 1.0
fecha: ${HOY}
---

# Method Vault · 8X by RENASER

La metodología maestra. **Vive fuera del repositorio a propósito**: el manual (§25) lo prohíbe
expresamente, y el repositorio se clona, se despliega y puede comprometerse.

## Cómo está organizado

| Carpeta | Qué guarda | Quién lo lee |
|---|---|---|
| \`01-CROWN-JEWEL\` | La metodología maestra | Solo personas. **Ningún agente, nunca.** |
| \`02-INTERNAL\` | Marcos y estándares de la consultora | Personas; se cura hacia RUNTIME |
| \`03-RUNTIME\` | Lo aprobado para los agentes | Los agentes autorizados en cada nota |
| \`04-GOLD-STANDARD\` | Ejemplos buenos y malos, con su porqué | Personas; alimenta la evaluación |
| \`05-APRENDIZAJES\` | Candidatos pendientes de aprobación | Nadie hasta aprobarse |
| \`_plantillas\` | La plantilla de nota | — |

## La regla que sostiene todo

\`\`\`
METHOD VAULT  →  CURACIÓN Y APROBACIÓN  →  PAQUETE RUNTIME  →  AGENTES
\`\`\`

Un agente **nunca** accede a la bóveda. Accede al paquete, y solo a lo que su nota autoriza.

## Cómo abrirlo

Es una bóveda de Obsidian estándar: **Abrir carpeta como bóveda** y apuntar aquí.

## Estado hoy

Esqueleto con el criterio que ya está implementado en 8X y verificado por pruebas. Cada nota
termina con **PENDIENTE DE KELIN**: lo que solo tú puedes aportar.

Lo que falta antes de conectarlo al sistema:

1. Que digas dónde está el material que ya tienes (hay mucho en \`Downloads\`, sin organizar)
2. Que completes los PENDIENTE de cada nota
3. Que se construya el Knowledge Gateway en el código
4. Que el equipo esté limpio: hoy no se conecta la bóveda a una máquina donde apareció un troyano
`;

// ── Creación, sin pisar nada
mkdirSync(RAIZ, { recursive: true });
for (const c of ["01-CROWN-JEWEL", "02-INTERNAL/marcos", "02-INTERNAL/estandares", "03-RUNTIME", "04-GOLD-STANDARD", "05-APRENDIZAJES", "_plantillas"]) {
  mkdirSync(path.join(RAIZ, c), { recursive: true });
}

let creadas = 0;
let respetadas = 0;

const indice = path.join(RAIZ, "00-INDICE.md");
if (existsSync(indice)) respetadas++;
else {
  writeFileSync(indice, INDICE, "utf8");
  creadas++;
}

for (const n of NOTAS) {
  const f = path.join(RAIZ, n.ruta);
  if (existsSync(f)) {
    respetadas++;
    continue;
  }
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, frontmatter(n) + n.cuerpo, "utf8");
  creadas++;
}

console.log(`Method Vault en: ${RAIZ}`);
console.log(`  ${creadas} notas creadas · ${respetadas} respetadas porque ya existían`);
console.log(`\nÁbrelo en Obsidian: Abrir carpeta como bóveda → ${RAIZ}`);
console.log(`NO está en el repositorio, a propósito.`);
