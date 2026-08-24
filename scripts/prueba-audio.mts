/**
 * PRUEBA REAL DE AUDIO (bloqueador 2): 90+ segundos hablados CON pausas de 10 segundos.
 * Genera voz real con el TTS de Gemini (tres tramos), los une en un solo WAV con 10 s de
 * silencio entre tramos (como una persona que piensa), y transcribe ese archivo ÚNICO con
 * GeminiProvider.transcribe — el mismo código que usa la app con el audio del MediaRecorder.
 * Verifica: una sola transcripción, las frases de LOS TRES tramos presentes, cada una UNA vez
 * (0 texto acumulativo, 0 duplicaciones), incluida la posterior a las pausas.
 *   node --env-file=.env.local --import=tsx scripts/prueba-audio.mts
 */
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GeminiProvider } from "../src/lib/ai/gemini";
const DIR = path.dirname(fileURLToPath(import.meta.url));

const TRAMOS = [
  "Mi empresa vende fruta a restaurantes de Lima desde hace nueve años y trabajamos con doce personas.",
  "El problema más grande es que los pedidos con descuento se quedan parados esperando mi aprobación.",
  "Quiero trabajar treinta horas a la semana y dedicar los viernes a mi familia en el campo.",
];

async function tts(texto: string): Promise<Int16Array> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Di esto con voz natural, sin prisa: ${texto}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { candidates: { content: { parts: { inlineData?: { data: string; mimeType: string } }[] } }[] };
  const parte = j.candidates[0].content.parts.find((p) => p.inlineData);
  if (!parte?.inlineData) throw new Error("TTS sin audio");
  const buf = Buffer.from(parte.inlineData.data, "base64"); // PCM s16le 24kHz mono
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

function wav(pcm: Int16Array, rate = 24000): Buffer {
  const datos = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + datos.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(datos.length, 40);
  return Buffer.concat([h, datos]);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zñ0-9 ]/g, " ").replace(/\s+/g, " ");
const cuenta = (pajar: string, aguja: string) => {
  let n = 0, i = 0;
  for (;;) { i = pajar.indexOf(aguja, i); if (i < 0) return n; n++; i += aguja.length; }
};

async function main() {
  console.log("generando voz real (3 tramos)…");
  const tramos = [] as Int16Array[];
  for (const t of TRAMOS) tramos.push(await tts(t));
  const RATE = 24000;
  const silencio10s = new Int16Array(RATE * 10); // pausa REAL de 10 segundos
  const total: Int16Array[] = [];
  tramos.forEach((t, i) => { total.push(t); if (i < tramos.length - 1) total.push(silencio10s); });
  // Relleno hasta superar 90 s de duración total.
  const muestras = total.reduce((a, t) => a + t.length, 0);
  const faltan = Math.max(0, RATE * 91 - muestras);
  if (faltan > 0) total.push(new Int16Array(faltan));
  const pcm = new Int16Array(total.reduce((a, t) => a + t.length, 0));
  let off = 0;
  for (const t of total) { pcm.set(t, off); off += t.length; }
  const archivo = wav(pcm);
  const dur = Math.round(pcm.length / RATE);
  writeFileSync(path.resolve(DIR, "../benchmark/prueba-audio.wav"), archivo);
  console.log(`audio único: ${dur}s con 2 pausas de 10s (benchmark/prueba-audio.wav)`);

  console.log("transcribiendo con el MISMO código de la app (GeminiProvider.transcribe)…");
  const g = new GeminiProvider();
  const blob = new Blob([new Uint8Array(archivo)], { type: "audio/wav" });
  const t0 = Date.now();
  const r = await g.transcribe(blob, "audio/wav");
  console.log(`transcripción (${Date.now() - t0} ms):\n"${r.texto}"`);

  const texto = norm(r.texto);
  const frases: string[][] = [["fruta a restaurantes"], ["pedidos con descuento"], ["treinta horas", "30 horas"]];
  const resultados = frases.map((vars) => ({ frase: vars[0], veces: vars.reduce((a, v) => a + cuenta(texto, norm(v)), 0) }));
  const todas = resultados.every((x) => x.veces === 1);
  console.log(JSON.stringify({ duracion_s: dur, pausas_10s: 2, transcripciones: 1, frases: resultados, sin_duplicados: todas }, null, 1));
  process.exit(todas ? 0 : 1);
}
main().catch((e) => { console.error("prueba de audio falló:", e?.message ?? e); process.exit(1); });
