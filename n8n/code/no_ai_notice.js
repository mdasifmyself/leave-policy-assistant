// Why did this question get no AI answer? Tell the team once: the ceiling was reached, or OpenAI returned an error.
// Only the reason is sent on, never the question.
const j = $input.first().json;
const source = 'Leave Policy Assistant';
if (j.error) return [{ json: { source, title: 'AI request failed', detail: String(j.error.message || j.error).slice(0, 200) } }];
if (j.ai_limit_tell) return [{ json: { source, title: 'Daily AI limit reached', detail: '__LIMIT__ questions answered today. Until midnight visitors see a "come back tomorrow" message.' } }];
return [];
