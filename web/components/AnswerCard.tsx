"use client";
import { useState } from "react";
import {
  BookOpen,
  CaretDown,
  CaretRight,
  ChatTeardropText,
  Compass,
  Check,
  Copy,
  EnvelopeSimple,
  LockSimple,
  SpeakerHigh,
  Stop,
} from "@phosphor-icons/react";
import { HR_EMAIL, T } from "./strings";
import type { Citation, Lang, Part } from "@/lib/types";

const ICON = { answer: BookOpen, unknown: ChatTeardropText, privacy: LockSimple, out_of_scope: Compass, greeting: null };

// Highlights the exact words the answer relies on inside the full clause.
function Clause({ c }: { c: Citation }) {
  const fragments = c.quote
    .split(/\.\.\.|…/)
    .map((f) => f.trim().replace(/^["'.,;:()]+|["'.,;:()]+$/g, ""))
    .filter((f) => f.length > 3);
  const lower = c.text.toLowerCase().replace(/[‘’]/g, "'");
  const marks: [number, number][] = [];
  for (const f of fragments) {
    const i = lower.indexOf(f.toLowerCase().replace(/[‘’]/g, "'"));
    if (i >= 0) marks.push([i, i + f.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let at = 0;
  marks.forEach(([s, e], k) => {
    if (s < at) return;
    out.push(c.text.slice(at, s), <mark key={k}>{c.text.slice(s, e)}</mark>);
    at = e;
  });
  out.push(c.text.slice(at));
  return <blockquote lang="en">{out}</blockquote>;
}

// Sources: one button per cited section; opening it shows the policy's own words.
function Sources({ cits, lang }: { cits: Citation[]; lang: Lang }) {
  const [open, setOpen] = useState<string | null>(null);
  const t = T[lang];
  return (
    <div className="sources">
      <span className="label">{cits.length > 1 ? t.sources : t.source}</span>
      <div className="chips">
        {cits.map((c) => (
          <button
            key={c.section}
            className={`chip ${open === c.section ? "on" : ""}`}
            aria-expanded={open === c.section}
            onClick={() => setOpen(open === c.section ? null : c.section)}
          >
            <span lang="en">
              {t.section} {c.section} · {c.heading}
            </span>
            <CaretDown size={12} weight="bold" aria-hidden />
          </button>
        ))}
      </div>
      {cits.map((c) =>
        open === c.section ? (
          <div key={c.section} className="clause">
            <span className="clause-head" lang="en">
              Section {c.section}, {c.heading}
            </span>
            <Clause c={c} />
          </div>
        ) : null,
      )}
    </div>
  );
}

export default function AnswerCard({
  parts,
  lang,
  speaking,
  onSpeak,
}: {
  parts: Part[];
  lang: Lang;
  ms?: number;
  speaking: boolean;
  onSpeak: () => void;
}) {
  const t = T[lang];
  const [copied, setCopied] = useState(false);
  const many = parts.length > 1;
  // The HR contact is offered only where the answer sends the reader to HR.
  const needsHR = parts.some((p) => p.status === "unknown" || p.status === "privacy");

  const copy = async () => {
    const txt = parts
      .map((p) => {
        const main = lang === "bn" && p.text_bn ? p.text_bn : p.text;
        const src = p.citations.length ? ` (Section ${p.citations.map((c) => c.section).join(", ")})` : "";
        return main + src;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <article className="card answer">
      {parts.map((p, i) => {
        const Icon = ICON[p.status];
        const bnText = lang === "bn" && p.text_bn ? p.text_bn : "";
        return (
          <section key={i} className="part">
            {(p.status !== "greeting" || many) && (
              <div className="part-head">
                {Icon && (
                  <span className={`status s-${p.status}`}>
                    <Icon size={16} weight="bold" aria-hidden /> {t.status[p.status]}
                  </span>
                )}
                {many && p.question_part && <span className="part-about">{p.question_part}</span>}
              </div>
            )}
            {/* The fallback sentence is always shown word for word, never reworded. */}
            <p className="part-text" lang={bnText ? "bn" : "en"}>
              {bnText || p.text}
            </p>
            {lang === "bn" && p.status === "answer" && p.bn_fallback && <p className="note">{t.englishOnly}</p>}
            {p.citations.length > 0 && <Sources cits={p.citations} lang={lang} />}
          </section>
        );
      })}

      {needsHR && (
        <a className="hr-row" href={`mailto:${HR_EMAIL}?subject=${encodeURIComponent("Leave policy question")}`}>
          <EnvelopeSimple className="hr-icon" size={20} aria-hidden />
          <span className="hr-text">
            <span className="hr-title">{t.emailHR}</span>
            <span className="hr-sub" lang="en">
              {HR_EMAIL} · {t.hrNote}
            </span>
          </span>
          <CaretRight className="row-chev" size={14} weight="bold" aria-hidden />
        </a>
      )}

      <div className="card-actions">
        <button className="text-btn" onClick={onSpeak} aria-pressed={speaking}>
          {speaking ? <Stop size={15} weight="fill" /> : <SpeakerHigh size={17} />}
          {speaking ? t.stop : t.listen}
        </button>
        <button className="text-btn" onClick={copy}>
          {copied ? <Check size={17} weight="bold" /> : <Copy size={17} />}
          {copied ? t.copied : t.copy}
        </button>
      </div>
    </article>
  );
}
