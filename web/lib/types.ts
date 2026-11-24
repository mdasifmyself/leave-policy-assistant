export type Lang = "en" | "bn";
export type Status = "answer" | "unknown" | "privacy" | "greeting" | "out_of_scope";

export interface Citation {
  section: string;
  heading: string;
  text: string; // the full clause, word for word from the policy
  quote: string; // the exact words the answer relies on
}

export interface Part {
  status: Status;
  question_part: string;
  text: string;
  text_bn: string;
  bn_fallback?: boolean;
  citations: Citation[];
  // What the voice reads in each language: built and signed on the server.
  speak_en: string;
  sig_en: string;
  speak_bn: string;
  sig_bn: string;
}

export interface AskReply {
  ok: true;
  lang: Lang;
  parts: Part[];
  ms: number;
}

export interface AskError {
  ok: false;
  error: string;
  message: string;
}
