// Step 6 - Check the AI's answer against the policy before anyone sees it.
// The AI's output is a candidate, not the truth. This node:
//  - replaces "unknown" with the exact required sentence (no citation),
//  - replaces "privacy" with a fixed polite refusal (Section 13, confidentiality),
//  - checks every cited section exists and every quote is word for word in it,
//  - checks every number in the answer appears in the cited sections,
//  - checks the Bangla answer uses the same numbers (else shows English only).
// If anything fails, it returns valid=false with the reasons, and the workflow
// asks the AI once more. A second failure becomes an honest technical error.
const ctx = $('Build request').first().json;
const raw = $input.first().json;
const ATTEMPT = __ATTEMPT__;

const UNKNOWN = "I don't know, please contact HR.";
const PRIVACY_EN = "Under the policy, other employees' leave records, leave balances and medical details are kept confidential and shared only with authorised people. For a work need, HR will be glad to help through the right channel.";
const PRIVACY_BN = 'নীতিমালা অনুযায়ী অন্য কর্মীদের ছুটির রেকর্ড, ছুটির ব্যালান্স ও চিকিৎসা-সংক্রান্ত তথ্য গোপনীয় রাখা হয় এবং শুধু অনুমোদিত ব্যক্তিরাই তা দেখতে পারেন। কাজের প্রয়োজনে সঠিক মাধ্যমে সহায়তার জন্য HR-এর সাথে যোগাযোগ করুন।';
const PRIVACY_OTHER_EN = "Personal details of other employees are kept confidential. For a work need, HR will be glad to help through the right channel.";
const PRIVACY_OTHER_BN = 'অন্য কর্মীদের ব্যক্তিগত তথ্য গোপনীয় রাখা হয়। কাজের প্রয়োজনে সঠিক মাধ্যমে সহায়তার জন্য HR-এর সাথে যোগাযোগ করুন।';
// The clauses shown under the privacy refusal: what is confidential, and that nobody may share it.
// These ids belong to the sample policy in policy/policy_sections.json; change them with the policy.
const PRIVACY_SECTIONS = ['13.1', '13.3'];
// Small talk gets a fixed, reviewed reply: friendly, and it can never invent policy facts.
const SMALLTALK = {
  hello: ['Hello! I am the Leave Policy Assistant. Ask me anything about the Northfield Trading Leave Policy.',
    'হ্যালো! আমি লিভ পলিসি অ্যাসিস্ট্যান্ট। Northfield Trading-এর ছুটির নীতিমালা নিয়ে যেকোনো প্রশ্ন করুন।'],
  how_are_you: ['I am doing well, thank you for asking. How can I help with leave today?',
    'আমি ভালো আছি, জিজ্ঞেস করার জন্য ধন্যবাদ। ছুটি নিয়ে আজ কীভাবে সাহায্য করতে পারি?'],
  can_hear: ['Yes, I can hear you clearly. What would you like to know about leave?',
    'হ্যাঁ, আমি আপনার কথা পরিষ্কার শুনতে পাচ্ছি। ছুটি নিয়ে কী জানতে চান?'],
  thanks: ['You are welcome. Feel free to ask anything else about leave.',
    'আপনাকেও ধন্যবাদ। ছুটি নিয়ে আর কিছু জানতে চাইলে জিজ্ঞেস করুন।'],
  about: ['I answer questions about the Northfield Trading Leave Policy and show the section each answer comes from. You can type or speak, in English or Bangla.',
    'আমি Northfield Trading-এর ছুটির নীতিমালা নিয়ে প্রশ্নের উত্তর দিই এবং প্রতিটি উত্তরের সেকশন দেখাই। বাংলা বা ইংরেজিতে লিখে বা বলে প্রশ্ন করতে পারেন।'],
  goodbye: ['Thank you, and have a good day.', 'ধন্যবাদ, আপনার দিনটি ভালো কাটুক।'],
};

const sections = ctx.sections;
const byId = Object.fromEntries(sections.map(s => [s.id, s]));
const errors = [];

// --- read the model output -------------------------------------------------
let text = null;
for (const o of raw.output || []) for (const c of o.content || []) if (c.type === 'output_text') text = c.text;
let parsed = null;
try { parsed = JSON.parse(text); } catch (e) { errors.push('The output was not valid JSON.'); }
const parts = (parsed && Array.isArray(parsed.parts)) ? parsed.parts : [];
if (parsed && !parts.length) errors.push('No parts were returned.');

// --- helpers ----------------------------------------------------------------
const norm = s => String(s || '').toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAscii = s => String(s || '').replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fourteen: 14, sixteen: 16, twenty: 20, thirty: 30, sixty: 60 };
function numbers(s) {
  let t = toAscii(norm(s));
  t = t.replace(/sections?\s*\d+(\.\d+)?(\s*\([a-e]\))?/g, ' ').replace(/hr-pol-\d+/g, ' ');
  t = t.replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|sixteen|twenty|thirty|sixty)\b/g, w => String(WORDS[w]));
  return new Set((t.match(/\d+(?:[.:]\d+)?/g) || []).map(x => x.replace(/\.0+$/, '')));
}
// Bangla number words a speaker may use in the question ("বারো দিন" = 12 days).
const BN_WORDS = { 'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'ছয়': 6, 'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10,
  'এগারো': 11, 'বারো': 12, 'তেরো': 13, 'চৌদ্দ': 14, 'পনেরো': 15, 'ষোলো': 16, 'বিশ': 20, 'ত্রিশ': 30, 'ষাট': 60 };
function questionNumbers(q) {
  const found = numbers(q);
  for (const w of String(q).split(/[\s,.?!।()]+/)) if (BN_WORDS[w]) found.add(String(BN_WORDS[w]));
  return found;
}
function quoteIn(quote, sectionText) {
  const frags = norm(quote).split(/\.\.\.|…/)
    .map(f => f.trim().replace(/^[\s"'.,;:()]+|[\s"'.,;:()]+$/g, '')).filter(Boolean);
  if (!frags.length) return false;
  if (frags.join(' ').split(' ').length < 3) return false;
  const hay = norm(sectionText);
  return frags.every(f => hay.includes(f));
}
function resolveSection(id, quote) {
  const k = String(id || '').replace(/section/ig, '').replace(/§/g, '').replace(/\s+/g, '').trim();
  if (byId[k] && quoteIn(quote, byId[k].text)) return k;
  // The quote is the ground truth: if it is word for word in exactly one
  // section, use that section (fixes "2" vs "2.3" style slips).
  const hits = sections.filter(s => quoteIn(quote, s.text));
  if (hits.length === 1) return hits[0].id;
  if (byId[k] && hits.some(h => h.id === k)) return k;
  return null;
}
// A near-exact quote (>= 80% of its words, in the same cited section) is snapped to
// the exact policy wording, so a small punctuation slip doesn't block a correct answer.
const words = t => norm(t).replace(/[^a-z0-9.:' ]/g, ' ').split(' ').filter(Boolean);
function nearQuote(id, quote) {
  const k = String(id || '').replace(/section/ig, '').replace(/§/g, '').replace(/\s+/g, '').trim();
  const sec = byId[k];
  if (!sec) return null;
  const q = words(quote), have = new Set(words(sec.text));
  if (q.length < 4) return null;
  return q.filter(w => have.has(w)).length / q.length >= 0.8 ? k : null;
}
const cite = id => ({ section: id, heading: byId[id].heading, text: byId[id].text });

// --- check each part ----------------------------------------------------------
const out = [];
parts.forEach((p, i) => {
  const label = `Part ${i + 1}`;
  if (p.status === 'unknown') {
    out.push({ status: 'unknown', question_part: p.question_part, text: UNKNOWN, text_bn: '', citations: [] });
  } else if (p.status === 'greeting') {
    const [en, bn] = SMALLTALK[p.smalltalk_kind] || SMALLTALK.hello;
    out.push({ status: 'greeting', question_part: p.question_part, text: en, text_bn: bn, citations: [] });
  } else if (p.status === 'out_of_scope') {
    // Outside the policy altogether: still the exact required sentence, with no citation.
    out.push({ status: 'out_of_scope', question_part: p.question_part, text: UNKNOWN, text_bn: '', citations: [] });
  } else if (p.status === 'privacy') {
    const leave = p.privacy_kind !== 'other';
    out.push({
      status: 'privacy', question_part: p.question_part,
      text: leave ? PRIVACY_EN : PRIVACY_OTHER_EN,
      text_bn: leave ? PRIVACY_BN : PRIVACY_OTHER_BN,
      citations: leave ? PRIVACY_SECTIONS.filter(id => byId[id]).map(id => ({ ...cite(id), quote: byId[id].text })) : [],
    });
  } else if (p.status === 'answer') {
    const ans = String(p.answer_en || '').trim();
    if (!ans) { errors.push(`${label}: status is answer but answer_en is empty.`); return; }
    const SILENT = /(does not|doesn't|do not|don't) (specify|say|state|mention|cover|list|set|give|provide|define|include|address|set out)|is silent|not specified|no (specific |separate )?(rule|period|requirement|limit|entitlement) is (given|set|stated)|(is|are) not (listed|mentioned|included|named|stated|specified)|sets no |gives no |(no|not any) [a-z -]{0,30} (is|are) (stated|set|given|specified)/i;
    if (SILENT.test(ans) && !/not covered by this policy|are not covered/i.test(ans)) {
      // The AI itself says the policy is silent. First time: ask it to fix. Second time: give the exact fallback.
      if (ATTEMPT === 1) { errors.push(`${label}: the answer says the policy does not state something. Either remove that sentence and answer only what the policy states, or use status "unknown".`); return; }
      out.push({ status: 'unknown', question_part: p.question_part, text: UNKNOWN, text_bn: '', citations: [] }); return;
    }
    if (ans.includes(UNKNOWN)) { errors.push(`${label}: do not mix the unknown sentence into an answer; use status unknown for that part.`); return; }
    const cits = [];
    for (const c of p.citations || []) {
      let id = resolveSection(c.section, c.quote);
      let quote = c.quote;
      if (!id && (id = nearQuote(c.section, c.quote))) quote = byId[id].text;
      if (!id) { errors.push(`${label}: quote "${c.quote}" is not word for word in section ${c.section}.`); continue; }
      if (!cits.some(x => x.section === id)) cits.push({ ...cite(id), quote });
    }
    if (!cits.length) { errors.push(`${label}: an answer needs at least one valid citation.`); return; }
    // Numbers may come from the cited sections, or be the user's own figure echoed back ("your 8 days").
    const allowed = new Set([...cits.flatMap(c => [...numbers(c.text)]), ...questionNumbers(ctx.question)]);
    const extra = [...numbers(ans)].filter(n => !allowed.has(n));
    if (extra.length) errors.push(`${label}: the number(s) ${extra.join(', ')} are not in the cited sections (${cits.map(c => c.section).join(', ')}). Cite the right section or remove them.`);
    // Both languages are always returned, so the reader can switch at any time.
    let bn = String(p.answer_bn || '').trim();
    let bn_fallback = false;
    const en = numbers(ans);
    const bnExtra = [...numbers(bn)].filter(n => !en.has(n) && !allowed.has(n));
    if (!bn || bnExtra.length) { bn = ''; bn_fallback = true; }
    out.push({ status: 'answer', question_part: p.question_part, text: ans, text_bn: bn, bn_fallback, citations: cits });
  } else {
    errors.push(`${label}: unknown status "${p.status}".`);
  }
});

// The pre-check saw a clear request for someone else's record: a privacy part must exist.
if (ctx.privacy_hint && parts.length && !parts.some(p => p.status === 'privacy')) {
  errors.push('The question asks for another person\'s leave or medical record. That part must have status "privacy".');
}

// Tidy: one fallback block is enough; put it last. An HR topic wins over an unrelated one.
const isFallback = p => p.status === 'unknown' || p.status === 'out_of_scope';
let final = out.filter(p => !isFallback(p));
const fallbacks = out.filter(isFallback);
if (fallbacks.length) {
  const lead = fallbacks.find(p => p.status === 'unknown') || fallbacks[0];
  final.push({ ...lead, question_part: fallbacks.map(u => u.question_part).join('; ') });
}
// A greeting next to a real answer is noise.
if (final.some(p => p.status !== 'greeting')) final = final.filter(p => p.status !== 'greeting');

const valid = errors.length === 0 && final.length > 0;
return [{ json: {
  valid, attempt: ATTEMPT, errors,
  reply: valid ? { ok: true, lang: ctx.lang, parts: final, meta: { model: raw.model || null, attempts: ATTEMPT, retry_reasons: ATTEMPT > 1 ? $('Check answer').first().json.errors : [] } } : null,
  model_output: text,
} }];
