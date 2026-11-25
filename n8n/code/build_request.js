// Step 4 - Build the OpenAI request: fixed rules + the whole policy + the question.
// Decision: the policy is short (about 65 brief clauses), so the model always sees all of it.
// No search step means no section can be missed.
const input = $('Check input').first().json;
const policy = $input.first().json;            // from the Policy Store workflow
const SYSTEM_PROMPT = __SYSTEM_PROMPT__;       // rules text (not confidential)
const MODEL = __MODEL__;

const policyText = policy.sections.map(s => `[${s.id}] ${s.heading}: ${s.text}`).join('\n');

const schema = {
  type: 'object', additionalProperties: false, required: ['parts'],
  properties: {
    parts: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['question_part', 'status', 'privacy_kind', 'smalltalk_kind', 'answer_en', 'answer_bn', 'citations'],
        properties: {
          question_part: { type: 'string' },
          status: { type: 'string', enum: ['answer', 'unknown', 'privacy', 'greeting', 'out_of_scope'] },
          privacy_kind: { type: 'string', enum: ['leave_or_medical', 'other', 'none'] },
          smalltalk_kind: { type: 'string', enum: ['hello', 'how_are_you', 'can_hear', 'thanks', 'about', 'goodbye', 'none'] },
          answer_en: { type: 'string' },
          answer_bn: { type: 'string' },
          citations: {
            type: 'array', maxItems: 6,
            items: {
              type: 'object', additionalProperties: false, required: ['section', 'quote'],
              properties: { section: { type: 'string' }, quote: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

const messages = [
  { role: 'system', content: SYSTEM_PROMPT.replace('{{POLICY}}', policyText) },
  { role: 'user', content: `lang: ${input.lang}\nquestion: ${input.question}` },
];

const body = {
  model: MODEL,
  input: messages,
  store: false,
  // Reasoning models (gpt-5 and later, o-series) take an effort setting; others reject it and get a fixed temperature.
  ...(/^(gpt-[5-9]|o\d)/.test(MODEL) ? { reasoning: { effort: __EFFORT__ } } : { temperature: 0 }),
  text: { format: { type: 'json_schema', name: 'policy_answer', strict: true, schema } },
};

return [{ json: { body, question: input.question, lang: input.lang, privacy_hint: input.privacy_hint, sections: policy.sections } }];
