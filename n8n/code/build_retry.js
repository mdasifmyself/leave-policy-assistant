// Step 7 - One retry. The AI sees its own answer and the exact problems found,
// and must fix them. Only one retry, so a bad case can't loop or run up cost.
const req = $('Build request').first().json;
const check = $input.first().json;
const body = JSON.parse(JSON.stringify(req.body));
body.input.push({ role: 'assistant', content: check.model_output || '(no valid output)' });
body.input.push({ role: 'user', content:
  'Your previous output failed these checks:\n- ' + check.errors.join('\n- ') +
  '\nReturn a corrected JSON answer to the same question. Quotes must be copied word for word from the cited section, ' +
  'and every number in answer_en must appear in a cited section. If the policy does not state it, use status "unknown".' });
return [{ json: { body } }];
