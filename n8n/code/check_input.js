// Step 2 - Check the request before anything costs money.
// In: webhook body { question, lang }. Out: clean question + language + privacy hint.
const body = $input.first().json.body || {};
const question = typeof body.question === 'string' ? body.question.trim() : '';
const lang = body.lang === 'bn' ? 'bn' : 'en';

let error = null;
if (!question) error = 'Please type a question.';
else if (question.length > 500) error = 'Please keep the question under 500 characters.';

// Safety net for privacy. Narrow on purpose: it only fires on clear requests
// about someone else's leave or health record. The model makes the main call.
const RECORD = '(leave|leaves|balance|sick|medical|health|absen\\w*|taken|used|off|record|records|reason|ছুটি|অসুস্থ|মেডিক্যাল)';
const strong = [
  new RegExp('\\b(colleague|co-?worker|teammate|team mate|another employee|other employee)s?\\b[\\s\\S]*' + RECORD, 'i'),
  new RegExp('\\b[A-Z][a-z]+\'s\\s+' + RECORD, ''),
  /\b[Hh]ow (many|much)\b[\s\S]*\b(has|did|have)\s+(?!I\b|you\b|we\b)[A-Z][a-z]+\s+(take|taken|use|used|had)\b/,
  /\bwhy (is|was)\s+(?!I\b)([A-Z][a-z]+|my colleague|my co-?worker|he|she)\s+(on|absent|off|sick)\b/i,
  /(সহকর্মী|অন্য কর্মী)[\s\S]*(ছুটি|অসুস্থ|মেডিক্যাল|কারণ)/,
];
const privacy_hint = !error && strong.some(r => r.test(question));

// debug=true (test runner only) adds the checker's reasons to error replies.
return [{ json: { ok: !error, error, question, lang, privacy_hint, debug: body.debug === true } }];
