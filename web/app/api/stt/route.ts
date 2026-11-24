// Speech to text: the recorded question goes to ElevenLabs Scribe and comes back
// as text. The text then goes through the same /api/ask route as typed chat.
import { env, json, limited } from "@/lib/server";

export const maxDuration = 30;
const MAX_BYTES = 3_000_000; // about 30 seconds of compressed speech

export async function POST(req: Request) {
  if (limited(req, "stt", 10, 200)) {
    return json({ ok: false, message: "Please wait a minute before the next voice question." }, 429);
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, message: "Ready when you are. Tap the mic and ask again." }, 400);
  }
  const audio = form.get("audio");
  const lang = form.get("lang") === "bn" ? "ben" : "eng";
  if (!(audio instanceof Blob) || audio.size < 1000) return json({ ok: false, message: "Ready when you are. Tap the mic and ask again." }, 400);
  if (audio.size > MAX_BYTES) return json({ ok: false, message: "Please keep the question short, about 20 seconds at most." }, 400);

  const out = new FormData();
  out.append("model_id", "scribe_v2");
  out.append("language_code", lang);
  out.append("tag_audio_events", "false");
  out.append("file", audio, "question.webm");
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
      body: out,
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return json({ ok: false, message: "Voice is resting for a moment. Typing works perfectly in the meantime." }, 503);
    const data = await r.json();
    const text = String(data.text || "").trim();
    if (!text) return json({ ok: false, message: "Ready when you are. Tap the mic and ask again." }, 200);
    return json({ ok: true, text });
  } catch {
    return json({ ok: false, message: "Voice is resting for a moment. Typing works perfectly in the meantime." }, 503);
  }
}
