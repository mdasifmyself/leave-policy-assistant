// Text to speech: reads an answer aloud with ElevenLabs. It only accepts text
// that /api/ask signed, so only checked answers are ever spoken.
import { env, json, limited, verify } from "@/lib/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (limited(req, "tts", 15, 300)) return json({ ok: false, message: "Please wait a minute." }, 429);
  let body: { text?: unknown; sig?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false }, 400);
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text || text.length > 900 || !verify(text, String(body.sig || ""))) {
    return json({ ok: false, message: "Only checked answers can be read aloud." }, 403);
  }
  try {
    const voice = env("ELEVENLABS_VOICE_ID");
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_v4_turbo" }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!r.ok || !r.body) return json({ ok: false, message: "The voice reply is resting for a moment. The written answer is ready above." }, 503);
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return json({ ok: false, message: "The voice reply is resting for a moment. The written answer is ready above." }, 503);
  }
}
