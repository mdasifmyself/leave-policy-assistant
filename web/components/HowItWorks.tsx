"use client";
import { useEffect, useRef } from "react";
import { BookOpen, ChatTeardropText, LockSimple, X } from "@phosphor-icons/react";
import evalResult from "@/lib/eval.json";
import { BUILDER_URL, HR_EMAIL } from "./strings";

// Four short sections, in the order a visitor asks: what does it do, how is it
// checked, how is it tested, and what should I know.

// Written by tests/run_eval.py after a full run. Until then "passed" is null and
// the panel shows only the size of the test set, never a result.
const ev = evalResult as {
  passed: number | null;
  runs: number | null;
  cases: number;
  repeats: number;
  date: string | null;
  model: string | null;
};
const hasResult = typeof ev.passed === "number" && typeof ev.runs === "number";
export default function HowItWorks({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="how" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="how-inner">
        <div className="how-top">
          <h2>How it works</h2>
          <button className="round-btn plain" onClick={onClose} aria-label="Close">
            <X size={16} weight="bold" />
          </button>
        </div>
        <p className="how-lead">
          A demo assistant for the sample Northfield Trading Leave Policy (HR-POL-001, version 1.0). Northfield
          Trading is a made-up company. The assistant works only with that policy and has no access to employee
          records.
        </p>

        <h3 className="group-title">What it does</h3>
        <ul className="group">
          <li className="info-row">
            <BookOpen className="row-icon tone-answer" size={22} aria-hidden />
            <div>
              <p className="row-title">Answers from the policy</p>
              <p className="row-desc">Every answer names its section, and you can open the policy&apos;s own words.</p>
            </div>
          </li>
          <li className="info-row">
            <ChatTeardropText className="row-icon tone-unknown" size={22} aria-hidden />
            <div>
              <p className="row-title">Sends other questions to HR</p>
              <p className="row-desc">
                When the policy doesn&apos;t cover a question, it replies exactly &ldquo;I don&apos;t know, please
                contact HR.&rdquo; and links to <a href={`mailto:${HR_EMAIL}`}>{HR_EMAIL}</a>.
              </p>
            </div>
          </li>
          <li className="info-row">
            <LockSimple className="row-icon tone-privacy" size={22} aria-hidden />
            <div>
              <p className="row-title">Keeps colleagues&apos; data confidential</p>
              <p className="row-desc">Other employees&apos; leave and medical details are never shared, whoever asks.</p>
            </div>
          </li>
        </ul>

        <h3 className="group-title">How an answer is checked</h3>
        <ol className="group steps">
          <li className="info-row">
            <span className="step-n">1</span>
            <p className="row-desc">Your question, typed or spoken, goes to an n8n workflow with the full policy.</p>
          </li>
          <li className="info-row">
            <span className="step-n">2</span>
            <p className="row-desc">The AI writes an answer and names the sections it used.</p>
          </li>
          <li className="info-row">
            <span className="step-n">3</span>
            <p className="row-desc">
              A checker confirms each section exists, each quote matches the policy, and each number appears in it.
            </p>
          </li>
          <li className="info-row">
            <span className="step-n">4</span>
            <p className="row-desc">Only a checked answer is shown or read aloud.</p>
          </li>
        </ol>

        <h3 className="group-title">Testing</h3>
        <div className="group stat">
          {hasResult ? (
            <>
              <p className="stat-n">
                {ev.passed} of {ev.runs}
              </p>
              <p className="row-desc">
                test runs passed: {ev.cases} questions asked {ev.repeats} times each, including policy gaps, privacy
                requests, attempts to change the rules, and Bangla. Run on {ev.date}.
              </p>
            </>
          ) : (
            <>
              <p className="stat-n">{ev.cases} test questions</p>
              <p className="row-desc">
                The test set covers everyday questions, policy gaps, privacy requests, attempts to change the rules,
                and Bangla. Results for this sample policy will be published here after the next full run.
              </p>
            </>
          )}
        </div>

        <h3 className="group-title">Good to know</h3>
        <ul className="group">
          <li className="info-row plain">
            <div>
              <p className="row-title">Next step</p>
              <p className="row-desc">
                With a secure sign-in and a read-only link to the HR system, it could also answer personal questions
                such as &ldquo;how many days do I have left?&rdquo; for the signed-in employee.
              </p>
            </div>
          </li>
          <li className="info-row plain">
            <div>
              <p className="row-title">Your data</p>
              <p className="row-desc">
                No chat history is kept. OpenAI processes the text and ElevenLabs the voice. Please use example details
                only.
              </p>
            </div>
          </li>
        </ul>

        <p className="how-foot">
          Built by{" "}
          <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer">
            Md Asif
          </a>
          {"."}
        </p>
      </div>
    </dialog>
  );
}
