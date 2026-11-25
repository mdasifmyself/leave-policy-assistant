// Step 4b - A daily ceiling on AI requests, so a public test space cannot run up a bill.
// Over the ceiling the visitor gets an honest "come back tomorrow" reply and no AI call is made.
// The count starts again at midnight (Asia/Dhaka).
const LIMIT = __LIMIT__;
const s = $getWorkflowStaticData('global');
const today = DateTime.now().setZone('Asia/Dhaka').toISODate();
if (s.day !== today) { s.day = today; s.used = 0; s.told = false; }
const ai_ok = s.used < LIMIT;
if (ai_ok) s.used += 1;
const tell = !ai_ok && !s.told;
if (tell) s.told = true;
return $input.all().map(i => ({ json: { ...i.json, ai_ok, ai_limit_tell: tell } }));
