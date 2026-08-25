/** Mini prueba: TTS de una frase → transcribe() con el modelo dedicado nuevo. Mide latencia. */
import { GeminiProvider } from "../../src/lib/ai/gemini";

const KEY = process.env.GEMINI_API_KEY!;
const frase = "El mes pasado vendimos veinticinco mil soles y nos deben como ocho mil los caseros.";

// TTS (24kHz PCM) → WAV
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
  body: JSON.stringify({ contents: [{ parts: [{ text: frase }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }),
});
const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
const b64 = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
if (!b64) throw new Error("TTS falló: " + JSON.stringify(j).slice(0, 200));
const pcm = Buffer.from(b64, "base64");
const wav = Buffer.alloc(44 + pcm.length);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);

const prov = new GeminiProvider();
const t0 = Date.now();
const out = await prov.transcribe(new Blob([wav]), "audio/wav");
console.log(`latencia: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("texto:", out.texto);
const ok = /veinticinco mil|25 mil|25.?000/i.test(out.texto) && /ocho mil|8 mil|8.?000/i.test(out.texto);
console.log(ok ? "PASS: montos conservados" : "REVISAR: montos no encontrados");
