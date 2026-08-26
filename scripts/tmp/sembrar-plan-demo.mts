/** Siembra un plan de MUESTRA en la empresa de prueba (solo para verificar el diseño) + chequea créditos Gemini. */
import { createClient } from "@supabase/supabase-js";
import { SalidaPlanEstrategico } from "../../src/lib/schemas";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// ¿Volvieron los créditos?
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-3.5-flash-lite"}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "di hola" }] }], generationConfig: { maxOutputTokens: 5 } }),
});
console.log("GEMINI:", r.status, r.status === 429 ? "SIN CRÉDITOS AÚN" : "OK — créditos activos");

const { data: c } = await sb.from("companies").select("id,nombre").ilike("nombre", "%Cevich%").order("created_at", { ascending: false }).limit(1).single();
const E = (texto: string, estado: "comprobado" | "por_validar" | "contradicho") => ({ texto, estado });
const plan = SalidaPlanEstrategico.parse({
  desafio: "El negocio vende bien al mediodía pero pierde casi la mitad del margen en mermas y en pedidos que nadie sigue por la tarde.",
  periodo: "2026–2029",
  resumen: {
    decision: { de: "una cevichería que depende del dueño en caja y cocina", a: "un local que opera con estándares sin el dueño presente", mediante: "sistematizar compra, porción y cierre diario con 3 indicadores" },
    realidad: "Ventas S/38,000/mes contadas; merma de pescado estimada 12% sin registro diario.",
    ambicion: "S/55,000/mes con margen verificado y un segundo turno rentable.",
    brecha: "No hay registro diario de merma ni de pedidos perdidos: se decide a ciegas.",
    apuestas: ["Registro diario de merma y caja (semana 1)", "Estandarizar porciones con balanza", "Reactivar clientes de menú corporativo"],
    renuncias: ["No abrir segundo local este año", "No ampliar carta (12 platos máximo)", "No fiar a nuevos clientes corporativos"],
    resultados: { d90: "Merma medida y bajo 8%", a1: "Margen verificado ≥ 22%", a3: "Segundo turno rentable" },
    pendientes: ["Decidir si el hijo asume la caja de la tarde", "Aprobar S/1,200 para balanza y congeladora chica"],
  },
  mandato: {
    origen: "El dueño no puede tomarse un día libre sin que caiga la venta.",
    problema: "Sostener el margen sin la presencia permanente del dueño.",
    alcance: "El local actual, sus 6 personas y la venta de mediodía y tarde.",
    fuera: "Apertura de nuevos locales y delivery propio.",
    restricciones: "Caja disponible S/4,000; nadie del equipo maneja hojas de cálculo.",
    exito: "El dueño descansa domingo y lunes y el margen no cae.",
  },
  radiografia: [
    { indicador: "Ventas mensuales", base: "S/38,000", tendencia: "estable", meta: "S/45,000 en 12 meses", fuente: "contado por el dueño, cuaderno de caja", confianza: "media" },
    { indicador: "Merma de pescado", base: "sin dato — levantarlo", tendencia: "sin_dato", meta: "medirla en 30 días, luego ≤8%", fuente: "no existe registro", confianza: "baja" },
    { indicador: "Dependencia del dueño", base: "presente 7/7 días", tendencia: "estable", meta: "5/7 días en 6 meses", fuente: "verificado en entrevista", confianza: "alta" },
  ],
  problemas: [
    { titulo: "Se pierde cerca de S/3,000 al mes en pescado que se compra de más y se merma", costo: "~S/3,000/mes (estimado sobre compra contada)", evidencias: ["compra diaria sin lista", "sin registro de merma"], causas: ["compra al ojo", "sin porción estándar"] },
    { titulo: "Los pedidos corporativos de la tarde no tienen dueño y se enfrían", costo: "~S/2,500/mes en pedidos no confirmados", evidencias: ["3 clientes corporativos perdidos citados en entrevista"], causas: ["nadie responde después de las 3pm"] },
  ],
  cuello: "Todo pasa por el dueño: compra, caja y cierre — nada está escrito.",
  foda: {
    fortalezas: [{ punto: "Punto de venta con 14 años de clientela", evidencia: "clientes que vuelven cada semana (contado)", implicacion: "la recompra sostiene el plan sin marketing pagado" }],
    debilidades: [{ punto: "Sin registro diario de nada", evidencia: "no existe cuaderno de merma ni de pedidos", implicacion: "primero medir, después decidir" }],
    oportunidades: [{ punto: "Menú corporativo de oficinas vecinas", evidencia: "3 empresas pidieron cotización el último mes", implicacion: "venta de tarde sin invertir en local" }],
    amenazas: [{ punto: "Subida del precio del pescado", evidencia: "proveedor subió 9% en 6 meses (contado)", implicacion: "sin porción estándar, la subida se come el margen" }],
    cruces: { fo: "Usar la clientela fiel para lanzar el menú corporativo", do: "Medir merma antes de negociar con proveedor", fa: "Cerrar precio semanal con proveedor por volumen", da: "Si el pescado sube otra vez, ajustar carta antes que precio" },
  },
  cliente: {
    prioritario: "El trabajador de oficina de la zona que almuerza S/18–25",
    problema: "Almorzar rico y rápido sin salir de la zona",
    criterios: ["rapidez", "frescura visible", "precio del menú"],
    abandono: ["espera de más de 20 minutos", "que se acabe el plato del día"],
    propuesta: "Ceviche del día servido en menos de 12 minutos",
    evidencia: "los reclamos contados son de espera, no de sabor",
    rentable: "El menú corporativo deja más margen que la mesa; el plato a la carta con espera larga destruye la propina y la recompra.",
  },
  canvas: {
    segmentos: E("Oficinistas de la zona + 3 empresas corporativas", "comprobado"),
    problemas: E("Almuerzo rápido y fresco en la zona", "comprobado"),
    propuesta: E("Ceviche del día en menos de 12 minutos", "por_validar"),
    solucion: E("Porción estándar + plato del día limitado", "por_validar"),
    canales: E("Local + WhatsApp para corporativo", "comprobado"),
    ingresos: E("Menú, carta y pedidos corporativos", "comprobado"),
    costos: E("Pescado 42% de la venta (estimado, sin registro)", "por_validar"),
    metricas: E("Venta diaria, merma, pedidos corporativos", "por_validar"),
    ventaja: E("14 años de caserío y ubicación", "comprobado"),
  },
  elecciones: {
    aspiracion: "Ser el almuerzo de confianza de las oficinas de la zona",
    donde: "El local actual y el corporativo en 1 km a la redonda",
    como: "Rapidez con frescura visible, a precio de menú",
    capacidades: "Compra por lista, porción con balanza, cierre diario",
    sistemas: "Cuaderno de merma, lista de compra, WhatsApp corporativo",
    renuncias: "Nada de delivery masivo ni carta larga",
  },
  opciones: [
    { nombre: "A · Sistematizar el local actual", impacto: "Alto: recupera ~S/5,500/mes", inversion: "S/1,200", tiempo: "90 días", riesgo: "Bajo", reversibilidad: "Total", capacidad: "El equipo actual", recomendada: true },
    { nombre: "B · Lanzar delivery propio", impacto: "Medio e incierto", inversion: "S/6,000+", tiempo: "6 meses", riesgo: "Alto", reversibilidad: "Media", capacidad: "Requiere contratar", recomendada: false },
    { nombre: "No actuar", impacto: "Se siguen perdiendo ~S/5,500/mes", inversion: "S/0", tiempo: "—", riesgo: "El dueño se agota y el margen cae con el pescado", reversibilidad: "—", capacidad: "—", recomendada: false },
  ],
  supuestos: [
    { supuesto: "El equipo llenará el cuaderno de merma a diario", senal: "3 días seguidos sin registro en las primeras 2 semanas", reversible: true },
    { supuesto: "Las oficinas vecinas sostienen 20 menús/día", senal: "menos de 10 pedidos/día en el mes 2", reversible: true },
  ],
  mapa: [
    { n: 1, objetivo: "Registro diario de merma y caja", area: "Procesos" },
    { n: 2, objetivo: "Porción estándar con balanza", area: "Producto" },
    { n: 3, objetivo: "Compra por lista semanal", area: "Procesos" },
    { n: 4, objetivo: "Responsable de tarde definido", area: "Personas" },
    { n: 5, objetivo: "Menú corporativo activo", area: "Marketing" },
    { n: 6, objetivo: "Margen verificado mensual", area: "Resultados" },
  ],
  prioridades: [
    { resultado: "Merma medida y bajo 8%", responsable: "Rosa (cocina)", kpi: "kg mermados/día", meta: "≤8%", fecha: "nov 2026" },
    { resultado: "20 menús corporativos/día", responsable: "el dueño", kpi: "menús entregados", meta: "20/día", fecha: "dic 2026" },
    { resultado: "Cierre diario sin el dueño", responsable: "hijo (caja)", kpi: "cierres correctos", meta: "6/6 días", fecha: "ene 2027" },
  ],
  operativo: {
    como: "El local funciona con tres rutinas escritas: compra por lista (lunes), porción con balanza (a diario) y cierre de caja contado (cada noche). El dueño revisa los tres números en 10 minutos, esté o no en el local.",
    capacidades: ["Comprar por lista", "Porcionar estándar", "Cerrar caja diaria"],
    decisiones: [
      { decision: "Cuánto pescado comprar", decide: "el dueño (con la lista)", ejecuta: "Rosa" },
      { decision: "Precio del menú del día", decide: "el dueño", ejecuta: "hijo (caja)" },
      { decision: "Aceptar pedido corporativo", decide: "hijo (caja)", ejecuta: "cocina" },
    ],
  },
  portafolio: [
    { iniciativa: "Registro de merma y caja", decision: "acelerar", recursos: "S/40 en cuadernos + 15 min/día de Rosa", responsable: "Rosa" },
    { iniciativa: "Menú corporativo", decision: "probar", recursos: "2 horas/semana del dueño, 1 mes de prueba", responsable: "el dueño" },
    { iniciativa: "Ampliar carta", decision: "detener", recursos: "libera compra y congeladora", responsable: "el dueño" },
  ],
  roadmap: {
    d90: [{ hito: "Cuaderno de merma en uso", resultado: "30 días de datos reales" }, { hito: "Balanza en cocina", resultado: "porción estándar servida" }],
    a1: [{ hito: "Menú corporativo estable", resultado: "20 menús/día" }, { hito: "Cierre sin el dueño", resultado: "descansa 2 días/semana" }],
    a3: [{ hito: "Segundo turno rentable", resultado: "venta de tarde ≥ 30% del día" }],
  },
  tablero: [
    { objetivo: "Margen", indicador: "Merma diaria", tipo: "predictivo", base: "sin dato", meta: "≤8%", responsable: "Rosa", frecuencia: "diaria" },
    { objetivo: "Venta", indicador: "Menús corporativos", tipo: "resultado", base: "0", meta: "20/día", responsable: "el dueño", frecuencia: "diaria" },
    { objetivo: "Caja", indicador: "Caja mínima", tipo: "guardarrail", base: "S/4,000", meta: "nunca bajo S/2,500", responsable: "hijo", frecuencia: "semanal" },
    { objetivo: "Disciplina", indicador: "Días con registro completo", tipo: "disciplina", base: "0", meta: "6/6", responsable: "Rosa", frecuencia: "semanal" },
  ],
  riesgos: [
    { riesgo: "El equipo abandona el registro", senal: "3 días sin llenar", impacto: "se vuelve a decidir a ciegas", respuesta: "el dueño revisa el cuaderno cada noche el primer mes", responsable: "el dueño" },
  ],
  gobierno: {
    semanal: "Lunes 8am, 20 minutos: merma, caja y pedidos de la semana — dueño, Rosa e hijo.",
    mensual: "Primer domingo: margen del mes y decisión de compra — dueño e hijo.",
    trimestral: "Revisar si el menú corporativo cumple 20/día: seguir, ajustar o detener.",
    anual: "Con 12 meses de datos: decidir segundo turno y si se retoma la idea del delivery.",
    aprendizaje: "La hipótesis central a vigilar: que la merma baje con el registro. Si con 60 días de cuaderno la merma no baja de 10%, el problema no es medición sino compra — y se cambia el plan de compra por completo.",
  },
  nota_confianza: "Las cifras de venta y la dependencia del dueño están contadas y verificadas en entrevista. La merma y el costo de pescado son estimados sin registro: los primeros 30 días del plan existen precisamente para convertirlos en datos. El menú corporativo es una apuesta con demanda señalada (3 cotizaciones) pero no comprobada.",
});
const { error } = await sb.from("deliverables").insert({ company_id: c!.id, tipo: "plan_estrategico", contenido: plan, version: 1 });
console.log(error ? `ERROR: ${error.message}` : `Plan de muestra sembrado en ${c!.nombre} (${c!.id})`);
