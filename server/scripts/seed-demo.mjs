// Seeds a demo org with 30 days of labelled sessions (no LLM calls). For local UI work and demos.
// Usage: DATABASE_URL=... node scripts/seed-demo.mjs
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost/commons_dev", { max: 1 });
const password = "demo-password";
const salt = randomBytes(16);
const token = "cmn_demo_" + randomBytes(8).toString("hex");
const [org] = await sql`
  insert into orgs (name, slug, token_hash, password_hash, seats)
  values ('Demo Co', ${"demo-" + randomBytes(2).toString("hex")}, ${createHash("sha256").update(token).digest("hex")},
          ${`${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`}, 8)
  returning id, slug`;

const people = ["asha", "ravi", "meera", "john", "fatima", "li"].map((n) => `${n}@demo.example`);
const weight = [9, 7, 5, 3, 2, 1]; // sessions per week, roughly
const work = [
  { cat: "Sales & customer work", task: "Summarise sales calls for the CRM", skill: "sales-recap", ext: "docx", mcp: "hubspot", p: "Summarise this call transcript for HubSpot" },
  { cat: "Sales & customer work", task: "Draft follow-up emails after customer meetings", skill: null, ext: null, mcp: null, p: "Write a follow-up email to the client after today's demo" },
  { cat: "Documents & reports", task: "Write weekly status reports", skill: "docx", ext: "docx", mcp: null, p: "Turn these notes into our weekly status report" },
  { cat: "Spreadsheets & data", task: "Clean and reconcile CSV exports", skill: "xlsx", ext: "xlsx", mcp: null, p: "Reconcile these two exports and flag mismatches" },
  { cat: "Research", task: "Research competitors before calls", skill: null, ext: "md", mcp: null, p: "What does this company sell and who are their competitors?" },
  { cat: "Code & automation", task: "Write SQL queries for reports", skill: null, ext: "sql", mcp: null, p: "Write a query for monthly active customers by region" },
];
await sql`insert into categories ${sql([...new Set(work.map((w) => w.cat))].map((name) => ({ org_id: org.id, name })))} on conflict do nothing`;
const taskIds = {};
for (const w of work) {
  const [t] = await sql`insert into tasks (org_id, label, category) values (${org.id}, ${w.task}, ${w.cat}) returning id`;
  taskIds[w.task] = t.id;
}

let n = 0;
for (let day = 29; day >= 0; day--) {
  for (const [i, email] of people.entries()) {
    if (Math.random() > weight[i] / 7) continue;
    const w = work[Math.floor(Math.random() ** (i < 2 ? 0.7 : 1.4) * work.length)];
    const at = new Date(Date.now() - day * 86400e3 - Math.random() * 8 * 3600e3);
    const sid = randomUUID();
    const usesSkill = w.skill && Math.random() < (i < 2 ? 0.9 : 0.4);
    await sql`insert into sessions (id, org_id, email, surface, first_at, last_at, has_hooks, has_otel, model, input_tokens, output_tokens, cost_usd, category, task_id, summary, classified_at)
      values (${sid}, ${org.id}, ${email}, ${Math.random() < 0.85 ? "cowork" : "claude-code"}, ${at}, ${new Date(+at + 9e5)}, true, true,
              'claude-sonnet-5', ${20000 + Math.floor(Math.random() * 60000)}, ${2000 + Math.floor(Math.random() * 6000)}, ${(0.05 + Math.random() * 0.4).toFixed(4)},
              ${w.cat}, ${taskIds[w.task]}, ${w.task}, now())`;
    const prompts = 1 + Math.floor(Math.random() * (usesSkill ? 3 : 9));
    for (let k = 0; k < prompts; k++) {
      const pid = randomUUID();
      await sql`insert into prompts (id, session_id, ts, text, length) values (${pid}, ${sid}, ${new Date(+at + k * 60e3)}, ${k === 0 ? w.p : "Make it shorter"}, 40)`;
      if (k === 0 && usesSkill) await sql`insert into tool_events (dedup_key, session_id, prompt_id, ts, source, tool_name, skill_key, skill_raw, invocation) values (${"seed:" + pid}, ${sid}, ${pid}, ${at}, 'hook', 'Skill', ${w.skill}, ${w.skill}, 'model')`;
      if (k === 0 && w.ext) await sql`insert into tool_events (dedup_key, session_id, prompt_id, ts, source, tool_name, file_ext) values (${"seedf:" + pid}, ${sid}, ${pid}, ${at}, 'hook', 'Write', ${w.ext})`;
      if (k === 0 && w.mcp) await sql`insert into tool_events (dedup_key, session_id, prompt_id, ts, source, tool_name, mcp_server, mcp_tool) values (${"seedm:" + pid}, ${sid}, ${pid}, ${at}, 'hook', 'mcp__hubspot__create_note', ${w.mcp}, 'create_note')`;
    }
    n++;
  }
}
console.log(JSON.stringify({ org: org.slug, password, token, sessions: n }));
await sql.end();
