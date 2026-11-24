"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowUp,
  BookOpen,
  CaretRight,
  ChatTeardropText,
  Info,
  LockSimple,
  Microphone,
  SpeakerSimpleSlash,
  Stop,
} from "@phosphor-icons/react";
import AnswerCard from "./AnswerCard";
import HowItWorks from "./HowItWorks";
import { useRecorder } from "./useRecorder";
import { BUILDER_URL, T, type Tone } from "./strings";
import type { AskReply, Lang, Part } from "@/lib/types";

type Msg =
  | { id: number; role: "user"; text: string; voice: boolean; at: Date }
  | {
      id: number;
      role: "bot";
      state: "loading" | "done" | "error";
      parts?: Part[];
      ms?: number;
      lang: Lang;
      error?: string;
      question: string;
      voice: boolean;
      at: Date;
    };

// Flat, single-colour icons in the spirit of SF Symbols.
export const TONE_ICON: Record<Tone, typeof BookOpen> = { answer: BookOpen, unknown: ChatTeardropText, privacy: LockSimple };

export default function Assistant() {
  const [lang, setLang] = useState<Lang>("en");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [showHow, setShowHow] = useState(false);
  const nextId = useRef(1);
  const latestAsk = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speakToken = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const t = T[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lpa-lang");
      if (saved === "bn" || saved === "en") setLang(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const chooseLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("lpa-lang", l); // remembered only in this browser
    } catch {}
  };

  // ---- voice output -------------------------------------------------------
  const stopSpeaking = useCallback(() => {
    speakToken.current++;
    audio.current?.pause();
    audio.current = null;
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    async (id: number, parts: Part[], l: Lang) => {
      stopSpeaking();
      const token = ++speakToken.current;
      setSpeakingId(id);
      for (const p of parts) {
        try {
          const r = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(l === "bn" && p.text_bn ? { text: p.speak_bn, sig: p.sig_bn } : { text: p.speak_en, sig: p.sig_en }),
          });
          if (token !== speakToken.current) return; // stopped, or a newer answer took over
          if (!r.ok) break;
          const url = URL.createObjectURL(await r.blob());
          if (token !== speakToken.current) return;
          const a = new Audio(url);
          audio.current = a;
          await new Promise<void>((resolve) => {
            a.onended = a.onerror = () => resolve();
            a.play().catch(() => resolve());
          });
          URL.revokeObjectURL(url);
          if (token !== speakToken.current) return;
        } catch {
          break;
        }
      }
      if (token === speakToken.current) setSpeakingId(null);
    },
    [stopSpeaking],
  );

  // ---- asking -------------------------------------------------------------
  const ask = useCallback(
    async (question: string, voice: boolean) => {
      const q = question.trim();
      if (!q || busy) return;
      stopSpeaking();
      const userId = nextId.current++;
      const botId = nextId.current++;
      const askId = ++latestAsk.current;
      setDraft("");
      setBusy(true);
      setMsgs((m) => [
        ...m,
        { id: userId, role: "user", text: q, voice, at: new Date() },
        { id: botId, role: "bot", state: "loading", lang, question: q, voice, at: new Date() },
      ]);
      let reply: AskReply | null = null;
      let error = t.errorGeneric;
      try {
        const r = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, lang }),
        });
        const data = await r.json();
        if (data.ok) reply = data as AskReply;
        else if (data.message) error = data.message;
      } catch {}
      setMsgs((m) =>
        m.map((x) =>
          x.id === botId && x.role === "bot"
            ? reply
              ? { ...x, state: "done", parts: reply.parts, ms: reply.ms, at: new Date() }
              : { ...x, state: "error", error, at: new Date() }
            : x,
        ),
      );
      setBusy(false);
      // A spoken question gets a spoken answer, unless a newer question came in.
      if (reply && voice && askId === latestAsk.current) speak(botId, reply.parts, lang);
    },
    [busy, lang, speak, stopSpeaking, t.errorGeneric],
  );

  // ---- voice input --------------------------------------------------------
  const onAudio = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      try {
        const fd = new FormData();
        fd.append("audio", blob);
        fd.append("lang", lang);
        const r = await fetch("/api/stt", { method: "POST", body: fd });
        const data = await r.json();
        if (data.ok && data.text) ask(data.text, true);
        // Server notes are in English; Bangla mode shows its own friendly text.
        else rec.setError(lang === "bn" ? t.voiceFailed : data.message || t.voiceFailed);
      } catch {
        rec.setError(t.voiceFailed);
      } finally {
        setTranscribing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ask, lang, t.voiceFailed],
  );
  const rec = useRecorder(onAudio);
  const listening = rec.state === "listening";

  const micClick = () => {
    if (listening) return rec.stop();
    stopSpeaking();
    rec.start();
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    ask(draft, false);
  };

  const reset = () => {
    stopSpeaking();
    rec.cancel();
    latestAsk.current++;
    setMsgs([]);
    setDraft("");
    setBusy(false);
  };

  const editQuestion = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const empty = msgs.length === 0;

  return (
    <div className={`app ${lang === "bn" ? "is-bn" : ""}`}>
      <div className="wallpaper" aria-hidden />

      <header className="top">
        <div className="brand">
          {/* The app's own mark: a checked document. Drawn inline, so there is no image file to load. */}
          <svg className="logo-chip" viewBox="0 0 38 38" role="img" aria-label="Leave Policy Assistant">
            <rect width="38" height="38" rx="11" fill="#071529" />
            <path d="M13.5 9h7.8l5.2 5.2V27a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z" fill="#00C8F5" />
            <path d="M21.3 9v3.4a1.8 1.8 0 0 0 1.8 1.8h3.4Z" fill="#8DE6FB" />
            <path d="m15.3 21.3 2.6 2.6 5-5.6" fill="none" stroke="#071529" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="brand-text">
            <span className="brand-name">{T.en.appName}</span>
            <span className="brand-sub">{T.en.subtitle}</span>
          </span>
        </div>
        <div className="top-actions">
          <div className={`seg lg ${lang === "bn" ? "at-2" : ""}`} role="group" aria-label="Answer language">
            <span className="seg-thumb" aria-hidden />
            <button aria-pressed={lang === "en"} onClick={() => chooseLang("en")} aria-label="English">
              <span className="long">English</span>
              <span className="short">EN</span>
            </button>
            <button aria-pressed={lang === "bn"} onClick={() => chooseLang("bn")} lang="bn" aria-label="বাংলা">
              <span className="long">বাংলা</span>
              <span className="short">বাং</span>
            </button>
          </div>
          <button className="round-btn lg" onClick={() => setShowHow(true)} aria-label={t.how} title={t.how}>
            <Info size={21} />
          </button>
        </div>
      </header>

      <main className="thread" aria-live="polite">
        {empty ? (
          <section className="welcome">
            <p className="eyebrow">{T.en.scopeLine}</p>
            <h1>{t.title}</h1>
            <p className="lead">{t.lead}</p>

            <h2 className="group-title">{t.tryAsking}</h2>
            <ul className="group">
              {t.starters.map((s) => {
                const Icon = TONE_ICON[s.tone];
                return (
                  <li key={s.q}>
                    <button className={`row tone-${s.tone}`} onClick={() => ask(s.q, false)} disabled={busy}>
                      <Icon className="row-icon" size={22} />
                      <span className="row-text">
                        <span className="row-title">{s.q}</span>
                        <span className="row-sub">{s.label}</span>
                      </span>
                      <CaretRight className="row-chev" size={15} weight="bold" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="group-foot">{t.voiceHint}</p>
          </section>
        ) : (
          <>
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="user-row">
                  <div className="user-bubble">
                    {m.voice && (
                      <span className="via">
                        <Microphone size={12} weight="fill" aria-hidden /> {t.spoken}
                      </span>
                    )}
                    <span>{m.text}</span>
                  </div>
                  {m.voice && (
                    <button className="link-btn" onClick={() => editQuestion(m.text)}>
                      {t.editAsk}
                    </button>
                  )}
                </div>
              ) : (
                <div key={m.id} className="bot-row">
                  {m.state === "loading" ? (
                    <div className="typing" role="status" aria-label={t.checking}>
                      <span className="dots" aria-hidden>
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  ) : m.state === "error" ? (
                    <div className="card notice">
                      <p>{m.error}</p>
                      <button className="text-btn" onClick={() => ask(m.question, m.voice)} disabled={busy}>
                        <ArrowCounterClockwise size={17} /> {t.retry}
                      </button>
                    </div>
                  ) : (
                    <AnswerCard
                      parts={m.parts!}
                      lang={lang}
                      ms={m.ms}
                      speaking={speakingId === m.id}
                      onSpeak={() => (speakingId === m.id ? stopSpeaking() : speak(m.id, m.parts!, lang))}
                    />
                  )}
                </div>
              ),
            )}
            <div className="thread-end" hidden={busy}>
              <button className="text-btn" onClick={reset}>
                <ArrowCounterClockwise size={16} /> {t.newChat}
              </button>
            </div>
          </>
        )}
        <div ref={endRef} className="thread-anchor" />
      </main>

      <footer className="dock">
        {(listening || transcribing || speakingId !== null || rec.error) && (
          <div className={`voice-status lg ${rec.error ? "is-note" : ""}`} role="status">
            {listening && (
              <>
                <span className="meter" aria-hidden>
                  {[0.55, 0.9, 1, 0.9, 0.55].map((k, i) => (
                    <i key={i} style={{ transform: `scaleY(${0.18 + Math.min(1, rec.level * k * 1.7)})` }} />
                  ))}
                </span>
                {t.listening}
                <button className="link-btn" onClick={rec.cancel}>
                  {t.cancel}
                </button>
              </>
            )}
            {transcribing && <>{t.transcribing}…</>}
            {!listening && !transcribing && speakingId !== null && (
              <>
                {t.speaking}
                <button className="link-btn" onClick={stopSpeaking}>
                  <SpeakerSimpleSlash size={15} /> {t.stopSpeaking}
                </button>
              </>
            )}
            {!listening && !transcribing && speakingId === null && rec.error && (
              <>
                {rec.error}
                <button className="link-btn" onClick={() => rec.setError(null)}>
                  {t.dismiss}
                </button>
              </>
            )}
          </div>
        )}
        <form className="composer lg" onSubmit={submit}>
          <label htmlFor="q" className="sr-only">
            {t.placeholder}
          </label>
          <textarea
            id="q"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={500}
            placeholder={listening ? t.listening : t.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {draft.length > 400 && <span className="count">{500 - draft.length}</span>}
          <button
            type="button"
            className={`icon-btn mic ${listening ? "is-on" : ""}`}
            onClick={micClick}
            disabled={transcribing || busy}
            aria-label={listening ? t.stopRecording : t.askByVoice}
            title={listening ? t.stopRecording : t.askByVoice}
          >
            {listening ? <Stop size={15} weight="fill" /> : <Microphone size={21} />}
          </button>
          <button type="submit" className="icon-btn send" disabled={!draft.trim() || busy} aria-label={t.send} title={t.send}>
            <ArrowUp size={18} weight="bold" />
          </button>
        </form>
        <p className="fineprint">
          {t.fineprint}{" "}
          <span className="builder">
            {t.builtBy}{" "}
            <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer">
              Md Asif
            </a>
          </span>
        </p>
      </footer>

      {showHow && <HowItWorks onClose={() => setShowHow(false)} />}
    </div>
  );
}
