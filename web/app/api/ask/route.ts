// Chat and voice both ask here. This route never talks to OpenAI itself:
// it forwards the question to the n8n Answer Engine (which checks every answer
// against the policy) and signs what comes back.
import { env, json, limited, sign } from "@/lib/server";
import type { Lang, Part } from "@/lib/types";

export const maxDuration = 60;

const UNKNOWN = "I don't know, please contact HR.";

type Raw = Omit<Part, "speak_en" | "sig_en" | "speak_bn" | "sig_bn">;

function speakText(p: Raw, lang: Lang): string {
  // The exact fallback is spoken exactly, with no source (the policy has none for it).
  if (p.status === "unknown" || p.status === "out_of_scope") return UNKNOWN;
  const main = lang === "bn" && p.text_bn ? p.text_bn : p.text;
  if (!p.citations.length) return main;
  const ids = p.citations.map((c) => c.section).join(", ");
  return lang === "bn" && p.text_bn ? `${main} সূত্র: সেকশন ${ids}।` : `${main} Source: section ${ids}.`;
}

export async function POST(req: Request) {
  if (limited(req, "ask", 12, 300)) {
    return json({ ok: false, error: "rate", message: "Thank you for all the questions! Please wait a minute before the next one." }, 429);
  }
  let body: { question?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_input", message: "Please type a question." }, 400);
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const lang: Lang = body.lang === "bn" ? "bn" : "en";
  if (!question) return json({ ok: false, error: "bad_input", message: "Please type a question." }, 400);
  if (question.length > 500) {
    return json({ ok: false, error: "bad_input", message: "Please keep the question under 500 characters." }, 400);
  }

  const started = Date.now();
  try {
    const r = await fetch(env("N8N_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Assistant-Key": env("N8N_WEBHOOK_KEY") },
      body: JSON.stringify({ question, lang }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok || !data.ok || !Array.isArray(data.parts)) {
      const msg = data?.error === "bad_input" ? data.message : "The answer service is busy for a moment. Please try again.";
      return json({ ok: false, error: data?.error || "temporary", message: msg }, r.status === 400 ? 400 : 503);
    }
    // Both languages come back, so the reader can switch languages at any time.
    const parts: Part[] = data.parts.map((p: Raw) => {
      const speak_en = speakText(p, "en");
      const speak_bn = speakText(p, "bn");
      return { ...p, speak_en, sig_en: sign(speak_en), speak_bn, sig_bn: sign(speak_bn) };
    });
    return json({ ok: true, lang, parts, ms: Date.now() - started });
  } catch {
    return json({ ok: false, error: "temporary", message: "The answer service is busy for a moment. Please try again." }, 503);
  }
}
