# Los dos pilotos ficticios

Dos empresas inventadas para probar el software, no para probar que la consultoría funcione:
**Modas Lucero S.A.C.** (tienda de ropa de mujer en Surco, 4 personas) y **Estudio Vargas & Asociados**
(estudio jurídico en Jesús María, 3 personas). Empresas, personas, cifras y documentos son sintéticos
(instrucción de Dirección, 13-10-2026, sección 19). Nada de esto describe a un cliente real.

Lo que se prueba con ellos es que el sistema **lea entero, cuente lo que falta en vez de rellenarlo,
ponga al lado lo declarado y lo extraído sin dar ninguno por verificado, y calcule con la fórmula
correcta y sus supuestos a la vista**. Por eso los archivos llevan faltantes y contradicciones puestas
a propósito, todas listadas en `declaraciones.json`.

## Qué hay en esta carpeta

| Archivo | Qué es | Qué trae a propósito |
|---|---|---|
| `generar.py` | El generador. Determinista (semilla fija): misma corrida, mismos archivos. | — |
| `declaraciones.json` | Lo que cada dueño declaró en la entrada breve, las contradicciones y faltantes deliberados, y el mapa de los siete casos difíciles. Es la **única fuente de cifras** que no están dentro de un archivo (alquiler 6.500, tarifario 1.800). | — |
| `modas-lucero/funciones-del-personal.docx` | Word con los cuatro puestos (gerente, Rosa, Carmen, Jorge), funciones en viñetas y horario. Versión de marzo de 2025. | Jorge: «Funciones: POR DEFINIR.»; Carmen: «Horario: (no indicado)»; la gerente «fija precios de toda la tienda» y Rosa «fija precios de las ofertas». Nota final: no hay manual de caja ni de inventario. |
| `modas-lucero/contrato-alquiler.pdf` | Contrato de arrendamiento del local (48 m², renta S/ 6.500, 01-03-2025 a 28-02-2027). Una página con capa de texto. | El código solo sabe que tiene texto (pdf-lib); el texto lo lee el modelo. Sin modelo, la renta no se extrae. |
| `modas-lucero/ventas-e-inventario.xlsx` | Tres hojas. **Ventas** (abril–septiembre 2026: contado, tarjeta, total, compras, devoluciones). **Gastos** (alquiler, planilla, luz, mantenimiento, transporte, comisión de tarjeta, otros). **Inventario** (120 artículos: código, categoría, talla, stock, costo unitario, precio; y una fila TOTAL A COSTO). | Gastos: planilla y luz vacías en julio y agosto; transporte vacío en tres meses; otros vacío en junio. Inventario: 40 de los 120 artículos sin costo unitario; el total a costo de los 80 con costo (79.782) contradice los «como 40.000» declarados. |
| `estudio-vargas/tarifario-2025.pdf` | Tarifario de honorarios 2025 (laboral 1.800, civil 2.500, familia 1.200, consulta 150). Una página con capa de texto. | Vigencia en 2026 no confirmada. Sin modelo no se lee. |
| `estudio-vargas/procedimiento-seguimiento.docx` | Procedimiento de seguimiento de casos, borrador de seis pasos en viñetas. | El Dr. Vargas abre, «revisa y firma todos», lleva los vencimientos en su agenda personal y cobra. «Última revisión: no consta.» |
| `estudio-vargas/expedientes-2026-I.xlsx` | 110 expedientes del primer semestre de 2026: 62 laborales, 30 civiles, 18 de familia; abogado, fechas, estado, honorario pactado, cobrado, horas estimadas. | `horas_estimadas` vacía en los 110 (rentabilidad por servicio desconocida); `cobrado` vacío en 26; laborales pactados entre 1.200 y 2.200 frente al tarifario de 1.800. |

## Cómo regenerar los archivos

```
python tests/fixtures/pilotos/generar.py
```

Requiere `python-docx`, `openpyxl` y `reportlab` en la máquina (no son dependencias del repositorio).
El guion reescribe los seis archivos y `declaraciones.json`. Como la semilla es fija, el resultado es el
mismo byte a byte en cuanto a datos; si cambias una cifra en `generar.py`, revisa las pruebas que la
usan (`tests/documentos.test.ts`, `tests/finanzas.test.ts`, `tests/pilotos/*.test.ts`).

## Qué pruebas los usan, sin base y sin modelo

- `tests/pilotos/recorrido-determinista.test.ts`: el recorrido de los dos pilotos con solo los papeles.
  Lee el Excel y el Word con `src/lib/documentos`, usa `src/lib/finanzas` para margen de contribución,
  equilibrio, costeo por SKU y por servicio, y las reglas puras de `tests/pilotos/_reglas.ts` para poner
  al lado lo declarado y lo extraído. Demuestra tres de los siete casos difíciles (información
  desconocida, documento incompleto, contradicción) y deja los otros cuatro como `it.todo` con la
  referencia a la prueba que los cubre.
- `tests/pilotos/sembrar-candado.test.ts`: el guion de siembra contra dobles (candado real, base falsa).
- `tests/documentos.test.ts` y `tests/finanzas.test.ts`: lectura de Word/Excel y finanzas, con estos mismos archivos.

## Cómo se sembrarían en un proyecto de prueba (cuando exista)

Hoy (13-10-2026) **no existe un proyecto Supabase de prueba**: hace falta la cuenta de Kelin para
crearlo. El guion está escrito y probado con dobles, pero **no se ha corrido contra ninguna base**.

Cuando exista el proyecto:

1. Copia `.env.test.example` a `.env.test` y completa los valores del proyecto de **prueba**:
   `ENTORNO=prueba`, `DESTINOS_PRUEBA=<ref del proyecto de prueba>`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Aplica el SQL de `supabase/` en el
   orden de `supabase/orden-aplicacion.json` y crea el bucket `fuentes`.
2. Corre el guion:
   ```
   node --env-file=.env.test --import=tsx scripts/pilotos/sembrar.mts
   ```
   Lo primero que hace es pasar por el candado (`src/lib/entorno.ts`). Sin `ENTORNO=prueba`, con la URL
   de producción o con un destino que no está en `DESTINOS_PRUEBA`, **aborta con el mensaje del candado
   y no escribe nada**. Con destino autorizado deja: las dos empresas admitidas y en levantamiento; una
   cuenta de dueño por empresa (`duena.modas-lucero@pilotos.renaser.test`,
   `socio.estudio-vargas@pilotos.renaser.test`) con membresía de dueño; una cuenta de consultor
   (`consultor@pilotos.renaser.test`); las personas de cada equipo; los seis archivos subidos a Storage con
   su fuente (autor y periodo solo cuando el documento los dice); una fuente de texto con la entrada breve
   de cada dueño; y una extracción encolada por fuente con la misma clave de idempotencia que usa
   `POST /api/sources`. La contraseña de las cuentas se toma de `PILOTOS_CLAVE` si está, o se inventa y
   se imprime una sola vez.
3. Arranca el worker con el mismo entorno (`npm run worker`) para que la extracción corra con el modelo.
   A partir de ahí el recorrido es el de cualquier empresa: revisar la extracción, contrastar,
   diagnosticar.

El guion es idempotente (volver a correrlo no duplica empresas, cuentas, fuentes ni trabajos) y nunca
borra, ni siquiera lo que sembró. Usa las funciones de la aplicación (`validarArchivo`, `rutaStorage`,
`encolar`, `claveIdempotente`), nunca HTTP, para que lo sembrado sea exactamente lo que dejaría la app.

## Lo que estos pilotos no prueban

Que una empresa real mejore. Eso solo lo dice una empresa real con una línea base congelada y un corte
después (sección 14). Tampoco prueban PostgREST, Auth ni Storage reales: hasta que haya proyecto de
prueba, lo que hay es Postgres embebido para el SQL (`tests/sql`) y dobles para el resto.
