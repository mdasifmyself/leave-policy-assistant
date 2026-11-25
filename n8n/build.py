"""Builds the two n8n workflows from the files in this folder and deploys them.

  python3 n8n/build.py            # build + deploy (create or update by name), activate
  python3 n8n/build.py --export   # also write the clean, shareable export to workflows/

Workflows:
  1. "Policy Assistant | Answer Engine"   (webhook with a secret header, annotated)
  2. "Policy Assistant | Policy Store"    (holds the policy text from policy/policy_sections.json)

Settings and secrets are read from ~/.config/asif-demos/ and never written to the repo:
  n8n_url                  address of the n8n server, no trailing slash
  n8n_api_key              n8n API key
  openai_credential.json   {"id": "...", "name": "..."} of the OpenAI credential saved in n8n
  policy_webhook_secret    value of the X-Assistant-Key header (made on the first run if missing);
                           the website needs the same value as N8N_WEBHOOK_KEY
  openai_model             optional, default below
  openai_effort            optional, default below
The website's own secrets (policy_signing_secret, elevenlabs_key) are not used by this script.
"""
import json, pathlib, sys, uuid, urllib.request, urllib.error, secrets

ROOT = pathlib.Path(__file__).resolve().parent
PROJ = ROOT.parent
CFG = pathlib.Path.home() / ".config/asif-demos"
POLICY_FILE = PROJ / "policy/policy_sections.json"


def setting(name, default=None):
    f = CFG / name
    if f.exists():
        return f.read_text().strip()
    if default is None:
        raise SystemExit(f"Missing setting: {f}")
    return default


MODEL = setting("openai_model", "gpt-4.1-mini")
EFFORT = setting("openai_effort", "low")
N8N_URL = setting("n8n_url").rstrip("/")
N8N_KEY = setting("n8n_api_key")
_cred = json.loads(setting("openai_credential.json"))
OPENAI_CRED = {"id": _cred["id"], "name": _cred["name"]}
NAME_MAIN = "Policy Assistant | Answer Engine"
NAME_STORE = "Policy Assistant | Policy Store"
WEBHOOK_PATH = "policy-assistant/ask"
WEBHOOK_ID = "c41d7e52-8a36-4b0f-9d15-7f2a6e3b8c94"


def api(method, path, body=None):
    req = urllib.request.Request(N8N_URL + "/api/v1" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"n8n API {method} {path} -> {e.code}: {e.read().decode()[:500]}")


def find_workflow(name):
    cursor = None
    while True:
        d = api("GET", "/workflows?limit=100" + (f"&cursor={cursor}" if cursor else ""))
        for w in d["data"]:
            if w["name"] == name:
                return w
        cursor = d.get("nextCursor")
        if not cursor:
            return None


def webhook_credential():
    """Header-auth credential that the website's server must send. Created once."""
    f = CFG / "policy_webhook_cred.json"
    if f.exists():
        return json.loads(f.read_text())
    sf = CFG / "policy_webhook_secret"
    if sf.exists():
        secret = sf.read_text().strip()
    else:
        secret = secrets.token_urlsafe(32)
        sf.write_text(secret)
        sf.chmod(0o600)
    c = api("POST", "/credentials", {"name": "Policy Assistant | webhook key", "type": "httpHeaderAuth",
                                     "data": {"name": "X-Assistant-Key", "value": secret}})
    ref = {"id": c["id"], "name": c["name"]}
    f.write_text(json.dumps(ref)); f.chmod(0o600)
    return ref


def code(name, file, pos, **subs):
    js = (ROOT / "code" / file).read_text()
    for k, v in subs.items():
        js = js.replace(f"__{k}__", v)
    return {"id": str(uuid.uuid4()), "name": name, "type": "n8n-nodes-base.code", "typeVersion": 2,
            "position": pos, "parameters": {"jsCode": js}}


def if_node(name, expr, pos):
    return {"id": str(uuid.uuid4()), "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos,
            "parameters": {"conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": [{"id": str(uuid.uuid4()), "leftValue": expr, "rightValue": "",
                                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and"}, "options": {}}}


def respond(name, body_expr, code_, pos):
    return {"id": str(uuid.uuid4()), "name": name, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1,
            "position": pos, "parameters": {"respondWith": "json", "responseBody": body_expr,
                                            "options": {"responseCode": code_}}}


def openai(name, pos):
    return {"id": str(uuid.uuid4()), "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
            "position": pos, "onError": "continueErrorOutput",
            "parameters": {"method": "POST", "url": "https://api.openai.com/v1/responses",
                           "authentication": "predefinedCredentialType", "nodeCredentialType": "openAiApi",
                           "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
                           "options": {"timeout": 45000}},
            "credentials": {"openAiApi": OPENAI_CRED}}


def sticky(n, title, body, pos, w, h, color=None):
    node = {"id": str(uuid.uuid4()), "name": f"Note {n}", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1,
            "position": pos, "parameters": {"content": f"## {title}\n{body}", "width": w, "height": h}}
    if color:
        node["parameters"]["color"] = color
    return node


ERROR_BODY = json.dumps({"ok": False, "error": "temporary",
                         "message": "The answer service is busy for a moment. Please try again."})


def build_main(store_id, hook_cred, clauses):
    prompt = (ROOT / "system_prompt.md").read_text()
    Y = 300
    nodes = [
        {"id": str(uuid.uuid4()), "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2,
         "position": [0, Y], "webhookId": WEBHOOK_ID,
         "parameters": {"httpMethod": "POST", "path": WEBHOOK_PATH, "authentication": "headerAuth",
                        "responseMode": "responseNode", "options": {}},
         "credentials": {"httpHeaderAuth": hook_cred}},
        code("Check input", "check_input.js", [220, Y]),
        if_node("Input OK?", "={{ $json.ok }}", [440, Y]),
        respond("Reply: bad input", "={{ JSON.stringify({ ok: false, error: 'bad_input', message: $json.error }) }}",
                400, [660, Y + 220]),
        {"id": str(uuid.uuid4()), "name": "Load policy", "type": "n8n-nodes-base.executeWorkflow",
         "typeVersion": 1.2, "position": [660, Y],
         "parameters": {"workflowId": {"__rl": True, "value": store_id, "mode": "id"},
                        "workflowInputs": {"mappingMode": "defineBelow", "value": {}, "matchingColumns": [],
                                           "schema": [], "attemptToConvertTypes": False,
                                           "convertFieldsToString": True},
                        "mode": "once", "options": {"waitForSubWorkflow": True}}},
        code("Build request", "build_request.js", [880, Y],
             SYSTEM_PROMPT=json.dumps(prompt), MODEL=json.dumps(MODEL), EFFORT=json.dumps(EFFORT)),
        openai("Ask OpenAI", [1100, Y]),
        code("Check answer", "validate.js", [1320, Y], ATTEMPT="1"),
        if_node("Passed?", "={{ $json.valid }}", [1540, Y]),
        respond("Reply: answer", "={{ JSON.stringify($json.reply) }}", 200, [1760, Y - 40]),
        code("Build retry", "build_retry.js", [1760, Y + 220]),
        openai("Ask OpenAI again", [1980, Y + 220]),
        code("Check answer again", "validate.js", [2200, Y + 220], ATTEMPT="2"),
        if_node("Passed now?", "={{ $json.valid }}", [2420, Y + 220]),
        respond("Reply: answer (retry)", "={{ JSON.stringify($json.reply) }}", 200, [2640, Y + 140]),
        respond("Reply: temporary error",
                "={{ JSON.stringify(Object.assign(" + ERROR_BODY + ", $('Check input').first().json.debug ? "
                "{ debug: $json.errors || $json.error || null, model_output: $json.model_output || null } : {})) }}",
                503, [2640, Y + 420]),
    ]
    notes = [
        sticky(1, "1 · Receive the question",
               "**In:** `question`, `lang` (en / bn) from the website's server.\n"
               "**Decision:** the webhook needs a secret header, so only our own server can call it. "
               "The browser never sees n8n or any API key.\n**Fails:** wrong key → n8n rejects it (403).",
               [-60, -40], 260, 300),
        sticky(2, "2 · Check the input",
               "Empty or > 500 characters → polite 400 reply, no AI cost.\n"
               "Also flags clear requests for **someone else's** leave or medical record "
               "(a safety net; the AI still makes the main call).",
               [180, -40], 400, 300),
        sticky(3, "3 · Load the policy",
               f"Calls the **Policy Store** workflow, which holds the {clauses} clauses of the sample policy, "
               "word for word.\n**Decision:** the policy lives in one place, apart from the rules, so it "
               "can be replaced without touching this workflow.",
               [620, -40], 220, 300),
        sticky(4, "4 · Build the AI request",
               "Fixed rules + the **whole** policy + the question.\n"
               "**Decision:** no RAG / vector search. The policy is a few pages, so the AI always sees every "
               "section and cannot miss one.\nStrict JSON schema: each part is `answer`, `unknown`, "
               "`privacy` or `greeting`, with section + exact quote.",
               [840, -40], 420, 300),
        sticky(5, "5 · Ask OpenAI",
               f"Responses API, model `{MODEL}`, `store: false`.\n**Fails:** timeout / outage → "
               "honest \"temporary error\", never \"I don't know\" (a technical failure is not a policy answer).",
               [1060, 520], 260, 220),
        sticky(6, "6 · Check the answer (no blind trust)",
               "- `unknown` → exactly **\"I don't know, please contact HR.\"**, no citation\n"
               "- `privacy` → fixed polite refusal, Section 13\n"
               "- each cited section must exist, each quote must be word for word in it\n"
               "- each number in the answer must appear in the cited sections\n"
               "- Bangla must use the same numbers, else English only",
               [1280, -40], 420, 300),
        sticky(7, "7 · One retry, then an honest error",
               "If a check fails, the AI gets its answer back with the exact problems and one chance to fix "
               "them. Still failing → 503 \"temporary error\". Nothing unchecked is ever shown or spoken.",
               [1720, 520], 980, 220),
    ]
    c = lambda *targets: {"main": [[{"node": t, "type": "main", "index": 0} for t in ts] for ts in targets]}
    connections = {
        "Webhook": c(["Check input"]),
        "Check input": c(["Input OK?"]),
        "Input OK?": c(["Load policy"], ["Reply: bad input"]),
        "Load policy": c(["Build request"]),
        "Build request": c(["Ask OpenAI"]),
        "Ask OpenAI": c(["Check answer"], ["Reply: temporary error"]),
        "Check answer": c(["Passed?"]),
        "Passed?": c(["Reply: answer"], ["Build retry"]),
        "Build retry": c(["Ask OpenAI again"]),
        "Ask OpenAI again": c(["Check answer again"], ["Reply: temporary error"]),
        "Check answer again": c(["Passed now?"]),
        "Passed now?": c(["Reply: answer (retry)"], ["Reply: temporary error"]),
    }
    return {"name": NAME_MAIN, "nodes": notes + nodes, "connections": connections,
            "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none",
                         "saveDataErrorExecution": "all", "saveManualExecutions": False, "executionTimeout": 120}}


def build_store(policy):
    js = (f"// The sample leave policy ({policy['number']} v{policy['version']}), one entry per clause, word for word.\n"
          "// Kept in its own workflow so the policy can be replaced without touching the Answer Engine.\n"
          f"return [{{ json: {json.dumps(policy, ensure_ascii=False)} }}];\n")
    return {"name": NAME_STORE,
            "nodes": [
                {"id": str(uuid.uuid4()), "name": "When called by Answer Engine",
                 "type": "n8n-nodes-base.executeWorkflowTrigger", "typeVersion": 1.1, "position": [0, 0],
                 "parameters": {"inputSource": "passthrough"}},
                {"id": str(uuid.uuid4()), "name": "Policy sections", "type": "n8n-nodes-base.code",
                 "typeVersion": 2, "position": [240, 0], "parameters": {"jsCode": js}},
            ],
            "connections": {"When called by Answer Engine": {"main": [[{"node": "Policy sections", "type": "main", "index": 0}]]}},
            "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none", "saveDataErrorExecution": "none",
                         "saveManualExecutions": False}}


def upsert(wf):
    old = find_workflow(wf["name"])
    if old:
        if old.get("active"):
            api("POST", f"/workflows/{old['id']}/deactivate")
        api("PUT", f"/workflows/{old['id']}", wf)
        wid = old["id"]
    else:
        wid = api("POST", "/workflows", wf)["id"]
    return wid


def clean_export(main):
    """Shareable copy: placeholder credentials, no ids, no host."""
    wf = json.loads(json.dumps(main))
    for n in wf["nodes"]:
        n.pop("id", None)
        if "credentials" in n:
            for k in n["credentials"]:
                n["credentials"][k] = {"id": "REPLACE_ME", "name": f"<your {k} credential>"}
        if n["type"] == "n8n-nodes-base.executeWorkflow":
            n["parameters"]["workflowId"]["value"] = "REPLACE_WITH_POLICY_STORE_WORKFLOW_ID"
    return wf


if __name__ == "__main__":
    policy = json.loads(POLICY_FILE.read_text())
    store_id = upsert(build_store(policy))
    try:
        api("POST", f"/workflows/{store_id}/activate")
    except SystemExit as e:
        print("store activate:", e)
    main = build_main(store_id, webhook_credential(), sum(1 for s in policy["sections"] if s["id"] != "Header"))
    main_id = upsert(main)
    api("POST", f"/workflows/{main_id}/activate")
    (CFG / "policy_n8n_ids.json").write_text(json.dumps({"main": main_id, "store": store_id}))
    print("deployed", {"main": main_id, "store": store_id, "model": MODEL})
    print("webhook:", f"{N8N_URL}/webhook/{WEBHOOK_PATH}")
    if "--export" in sys.argv:
        out = PROJ / "workflows"; out.mkdir(exist_ok=True)
        (out / "leave-policy-assistant.json").write_text(json.dumps(clean_export(main), indent=1, ensure_ascii=False))
        print("clean export written")
