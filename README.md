# Leave Policy Assistant

A small web app that answers staff questions about a company leave policy.
You can type or speak, in English or Bangla. Every answer names the policy
section it comes from and shows that section's own words.

- **Live:** https://policy.asifmyself.xyz (answers from the sample policy below)
- **Case study:** https://asifmyself.xyz/case-studies/leave-policy-assistant

The policy in this repository is a sample for a made-up company,
Northfield Trading Ltd (HR-POL-001, version 1.0). See [`policy/policy.md`](policy/policy.md).

## What it does

| You ask | It replies |
|---|---|
| Something the policy covers, e.g. "Can I take 12 days of Annual Leave in a row?" | A short answer, the section numbers, and the exact policy text behind it |
| Something the policy does not cover, e.g. "Is there a meal allowance?" | Exactly: "I don't know, please contact HR." plus the HR email from the policy |
| Something about another person, e.g. "How many leave days has Rahim taken?" | A polite refusal that cites the confidentiality section |

A spoken question gets a spoken answer. The language switch changes the answer
between English and Bangla at any time.

## How an answer is checked

The model's reply is treated as a draft. Code checks it before anyone sees it.

1. **Section check.** Every section the answer cites must exist in the policy.
2. **Quote check.** Every quote must be in that section word for word.
3. **Number check.** Every number in the answer must appear in the cited
   sections (or be a number the person asked about).
4. **Bangla check.** The Bangla answer must use the same numbers as the English
   one. If it does not, the English answer is shown instead.
5. **One retry.** If a check fails, the model gets its draft back with the exact
   problems and one chance to fix them. If it fails again, the app shows an
   honest "busy, please try again" message. Nothing unchecked is shown or spoken.
6. **Fixed sentences.** When the policy has no answer, the reply is always the
   same sentence: "I don't know, please contact HR." The model cannot reword it.
   Requests for another employee's leave or medical details always get the same
   fixed refusal, whoever says they are asking (manager, HR, "he gave me permission").
7. **Signed speech.** The server signs each checked answer. The voice route only
   reads text with a valid signature, so unchecked text is never read aloud.

The whole policy is sent with every question. There is no search step, so no
section can be missed.

## Architecture

| Part | What it does | Where |
|---|---|---|
| Web app | Chat screen, language switch, microphone, "How it works" panel | Next.js 16 + React 19 on Vercel (`web/`) |
| `/api/ask` | Rate limit, forwards the question to n8n with a secret header, signs the answer | Next.js route |
| Answer Engine | Checks the input, loads the policy, asks the model, checks the answer, retries once | n8n workflow "Policy Assistant \| Answer Engine" |
| Policy Store | Holds the policy, one entry per clause | n8n workflow "Policy Assistant \| Policy Store" |
| Language model | Writes the draft answer as strict JSON | OpenAI Responses API, called from n8n |
| `/api/stt` | Turns a spoken question into text | ElevenLabs speech to text |
| `/api/tts` | Reads a checked answer aloud | ElevenLabs text to speech |

The browser never talks to n8n, OpenAI or ElevenLabs directly, and never sees a key.

```
policy/   the sample policy (JSON for the assistant, Markdown for people)
n8n/      build.py, the rules prompt, and the four code steps of the workflow
web/      the Next.js app
tests/    67 test questions and the script that runs them
```

## Configuration

Names only. Real values go in Vercel's environment settings, or in
`web/.env.local` for a local run. Never commit them.

| Name | Meaning |
|---|---|
| `N8N_WEBHOOK_URL` | Full address of the Answer Engine webhook (ends in `/webhook/policy-assistant/ask`) |
| `N8N_WEBHOOK_KEY` | Secret sent in the `X-Assistant-Key` header. Must match the n8n header credential |
| `ELEVENLABS_API_KEY` | Key for speech to text and text to speech |
| `ELEVENLABS_VOICE_ID` | The voice that reads answers |
| `ELEVENLABS_TTS_MODEL` | Optional. Speech model, must support English and Bangla |
| `SIGNING_SECRET` | Any long random string. Signs checked answers for the voice route |

`n8n/build.py` reads its own settings from `~/.config/asif-demos/`:
`n8n_url`, `n8n_api_key`, `openai_credential.json` (the id and name of the
OpenAI credential saved in n8n), `policy_webhook_secret` (made on the first run
if missing), and optionally `openai_model`, `openai_effort`,
`policy_ai_daily_limit` (default 200) and `alerts_workflow.json` (the id of a
separate n8n workflow that sends alerts).

## Build the workflows

```
python3 n8n/build.py            # create or update both workflows, then activate them
python3 n8n/build.py --export   # also write a shareable copy to workflows/
```

The script creates the two workflows by name, creates the webhook's header
credential on the first run, and prints the webhook address. Put that address in
`N8N_WEBHOOK_URL` and the value of `policy_webhook_secret` in `N8N_WEBHOOK_KEY`.

## Run the web app

```
cd web
npm install
npm run dev        # http://localhost:3010
```

## Run the test set

`tests/cases.json` holds 67 questions: everyday questions, edge cases, gaps in
the policy, privacy requests, attempts to override the rules, Bangla and
Banglish, and small talk. Each case lists the expected outcome, the section that
must be cited, and facts that must or must not appear.

```
python3 tests/run_eval.py              # every case once
python3 tests/run_eval.py --runs 3     # every case three times
python3 tests/run_eval.py T11 T32      # only these cases
```

The script calls the live webhook and writes `evaluation/results.csv`,
`evaluation/summary.md` and the figure shown in the app's "How it works" panel.

**Status:** the test set was rewritten for this sample policy and has not been
run against it yet. No pass rate is claimed here. Until a full run is done, the
app shows only the number of test questions.

## Change the policy

Edit `policy/policy_sections.json` (one entry per clause: `id`, `heading`,
`text`), then:

1. `python3 policy/render_md.py` to refresh `policy/policy.md`.
2. Update the section numbers named in `n8n/system_prompt.md`, the
   `PRIVACY_SECTIONS` line in `n8n/code/validate.js`, and the HR contact in
   `web/components/strings.ts`.
3. Update `tests/cases.json`, run `python3 n8n/build.py`, then run the test set.

## Limits

- It is a demo on a sample policy for a made-up company. It is not legal advice.
- It does not know who is asking. There is no sign-in and no link to an HR
  system, so it cannot answer "how many days do I have left?".
- It reads one document. Other company policies are outside its scope.
- Rate limits are counted in memory on each server instance (per visitor:
  12 questions a minute and 300 a day; voice has its own limits).
- The workflow itself stops at 200 AI questions a day (all visitors together).
  After that it replies "come back tomorrow" and makes no AI call. The last
  safety net is a spending cap at each provider.
- A crashed run, an OpenAI error or a reached daily limit can send the team a
  short message (the reason only, never the question).
- No chat history is kept. OpenAI processes the text and ElevenLabs the voice.
- The site asks search engines not to index it.

## Contact

Built by Md Asif · https://asifmyself.xyz

© Md Asif. All rights reserved.
