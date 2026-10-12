// End-to-end ingest check: replays real hook + OTLP payloads against a running server, then asserts on the DB.
// Usage: BASE=http://localhost:3005 TOKEN=cmn_... node test/replay.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3005";
const TOKEN = process.env.TOKEN;
const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost/commons_dev", { max: 1 });
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const sid = crypto.randomUUID(), pid = crypto.randomUUID();
const swap = (o) => JSON.parse(JSON.stringify(o).replaceAll("7d1c2e9a-4b3f-4f8e-9a51-0c2d6b8e4f10", sid).replaceAll("84606435-3611-4ef6-b413-028b4e0f06fa", pid));

// 1. Anonymous hooks (public plugin): stored, but unattributed.
for (const f of ["01-hook-UserPromptSubmit.json", "02-hook-PostToolUse-Skill.json", "03-hook-PostToolUse-Write.json", "04-hook-Stop.json"]) {
  const r = await post("/api/hooks", swap(fx(f)));
  assert.equal(r.status, 204, f);
  assert.equal(await r.text(), "", "hook responses must be empty");
}
await wait(800);
let [s] = await sql`select * from sessions where id = ${sid}`;
assert.ok(s, "session created from hooks");
assert.equal(s.org_id, null, "anonymous hooks don't pick an org");

// 2. OTLP without a token is rejected.
assert.equal((await post("/v1/logs", fx("05-otlp-logs-claude-code.json"))).status, 401);

// 3. Monitoring export claims the session for the org and adds identity + cost.
const r = await post("/v1/logs", swap(fx("05-otlp-logs-claude-code.json")), { authorization: `Bearer ${TOKEN}` });
assert.equal(r.status, 200);
await wait(800);
[s] = await sql`select * from sessions where id = ${sid}`;
assert.ok(s.org_id, "session claimed by org");
assert.equal(s.email, "meera.iyer@acme.example");
assert.ok(Number(s.cost_usd) > 0, "cost recorded");
assert.ok(s.has_hooks && s.has_otel);

const tools = await sql`select * from tool_events where session_id = ${sid}`;
assert.ok(tools.some((t) => t.skill_key === "word-count"), "skill run recorded");
assert.ok(tools.some((t) => t.file_ext === "txt"), "file extension recorded");
const prompts = await sql`select * from prompts where session_id = ${sid}`;
assert.equal(prompts.length, 1, "hook + OTel prompt deduplicated on prompt id");
const live = await sql`select * from live_events where session_id = ${sid} and org_id is null`;
assert.equal(live.length, 0, "early live events re-attached to the org");

// 4. Privacy: no file contents, paths or replies anywhere.
const dump = JSON.stringify(await sql`select row_to_json(x) from (
  select * from tool_events where session_id = ${sid}) x`) + JSON.stringify(await sql`select * from live_events where session_id = ${sid}`)
  + JSON.stringify(await sql`select * from sessions where id = ${sid}`);
for (const leak of ["/Users/meera", "out.txt", "4 words (counted", "Done! The result"]) {
  assert.ok(!dump.includes(leak), `leaked: ${leak}`);
}

// 5. Cowork-shaped OTLP: no tool_use_id, tool_input as a JSON string, MCP tool, user-typed slash skill.
const sid2 = crypto.randomUUID(), p2 = crypto.randomUUID();
const attr = (k, v) => ({ key: k, value: typeof v === "number" ? { intValue: String(v) } : { stringValue: v } });
const base = (seq, name) => [attr("session.id", sid2), attr("user.email", "Ravi@Acme.example"), attr("prompt.id", p2), attr("event.name", name), attr("event.sequence", seq), attr("event.timestamp", new Date().toISOString())];
const cowork = { resourceLogs: [{ resource: { attributes: [attr("service.name", "cowork")] }, scopeLogs: [{ logRecords: [
  { attributes: [...base(1, "user_prompt"), attr("prompt", "/sales-recap:sales-recap summarise this call for the CRM"), attr("prompt_length", 52)] },
  { attributes: [...base(2, "tool_result"), attr("tool_name", "Skill"), attr("success", "true"), attr("tool_input", '{"skill":"anthropic-skills:docx"}')] },
  { attributes: [...base(3, "tool_result"), attr("tool_name", "mcp__hubspot__get_contact"), attr("success", "true"), attr("tool_input", "{}")] },
  { attributes: [...base(4, "tool_result"), attr("tool_name", "Write"), attr("success", "true"), attr("tool_input", '{"file_path":"/Users/ravi/Clients/Acme/recap.docx","content":"SECRET')] },
  { attributes: [...base(5, "api_request"), attr("model", "claude-sonnet-5"), attr("input_tokens", 1200), attr("output_tokens", 300), { key: "cost_usd", value: { doubleValue: 0.0081 } }] },
  { attributes: [...base(6, "assistant_response"), attr("response", "PRIVATE MODEL REPLY")] },
] }] }] };
assert.equal((await post("/v1/logs", cowork, { authorization: `Bearer ${TOKEN}` })).status, 200);
await post("/v1/logs", cowork, { authorization: `Bearer ${TOKEN}` }); // exporter retry: must not double count
await wait(800);
const [s2] = await sql`select * from sessions where id = ${sid2}`;
assert.equal(s2.surface, "cowork");
assert.equal(s2.email, "ravi@acme.example");
assert.equal(Number(s2.input_tokens), 1200, "api_request deduplicated");
const t2 = await sql`select tool_name, skill_key, invocation, mcp_server, file_ext from tool_events where session_id = ${sid2} order by id`;
assert.deepEqual(t2.map((t) => t.skill_key).filter(Boolean).sort(), ["docx", "sales-recap"]);
assert.ok(t2.some((t) => t.mcp_server === "hubspot"));
assert.ok(t2.some((t) => t.file_ext === "docx"));
const dump2 = JSON.stringify(await sql`select * from tool_events where session_id = ${sid2}`) + JSON.stringify(await sql`select * from live_events where session_id = ${sid2}`);
for (const leak of ["SECRET", "/Users/ravi", "PRIVATE MODEL REPLY", "Clients/Acme"]) assert.ok(!dump2.includes(leak), `leaked: ${leak}`);

console.log("replay: all checks passed");
await sql.end();
