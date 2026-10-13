import { sql } from "./db";
import { sarvamJson, sarvamText } from "./sarvam";

/*
 * Each session gets: a category (from the org's own, emergent list), a recurring task label, and a
 * generic one-line summary. Categories are not fixed: the model reuses the org's existing ones and adds
 * a new one only when nothing fits; `consolidateCategories` merges them back down to MAX_CATEGORIES.
 */

const MAX_CATEGORIES = 10;
const CONCURRENCY = 4;

/** Runs the classifier at most once every 45 s across all server instances. */
export async function maybeClassify() {
  const claimed = await sql`
    insert into job_runs (name, last_run) values ('classify', now())
    on conflict (name) do update set last_run = now()
    where job_runs.last_run < now() - interval '45 seconds'
    returning 1`;
  if (claimed.length) await classifyPending();
}

type Pending = { id: string; org_id: string };

export async function classifyPending(limit = 40) {
  const pending = await sql<Pending[]>`
    select s.id, s.org_id from sessions s
    where s.org_id is not null and s.classified_at is null
      and (select min(ts) from prompts p where p.session_id = s.id) < now() - interval '60 seconds'
    order by s.first_at limit ${limit}`;
  // One org's sessions go one at a time, so each sees the tasks the previous one created and reuses
  // them instead of inventing near-duplicates. Different orgs run in parallel.
  const byOrg = new Map<string, Pending[]>();
  for (const s of pending) byOrg.set(s.org_id, [...(byOrg.get(s.org_id) ?? []), s]);
  const queues = [...byOrg.values()];
  const touched = new Set<string>();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queues.length) }, async () => {
      for (let q = queues.shift(); q; q = queues.shift()) {
        for (const s of q) {
          try {
            await classifySession(s);
            touched.add(s.org_id);
          } catch (err) {
            console.error("classify failed", s.id, err);
          }
        }
      }
    }),
  );
  for (const orgId of touched) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from categories where org_id = ${orgId}`;
    if (n > MAX_CATEGORIES + 2) await consolidateCategories(orgId);
  }
  return pending.length;
}

async function classifySession({ id, org_id }: Pending) {
  const prompts = await sql<{ text: string | null }[]>`
    select text from prompts where session_id = ${id} and text is not null
      and coalesce(regexp_replace(slash_skill, '^.*:', ''), '') not in ('my-usage', 'share-skill') order by ts limit 3`;
  const tools = await sql<{ skill_key: string | null; mcp_server: string | null; file_ext: string | null }[]>`
    select distinct skill_key, mcp_server, file_ext from tool_events where session_id = ${id}`;
  const skills = [...new Set(tools.map((t) => t.skill_key).filter(Boolean))];
  const connectors = [...new Set(tools.map((t) => t.mcp_server).filter(Boolean))];
  const files = [...new Set(tools.map((t) => t.file_ext).filter(Boolean))];

  // Nothing but Commons' own commands: not work worth labelling.
  if (!prompts.length) {
    await sql`update sessions set classified_at = now() where id = ${id}`;
    return;
  }

  const categories = (await sql<{ name: string }[]>`select name from categories where org_id = ${org_id} order by name`).map((c) => c.name);
  const tasks = await sql<{ label: string; category: string }[]>`
    select t.label, t.category from tasks t left join sessions s on s.task_id = t.id
    where t.org_id = ${org_id} group by t.id order by count(s.id) desc limit 80`;

  const session = [
    ...prompts.map((p, i) => `Prompt ${i + 1}: ${p.text!.slice(0, 1500)}`),
    `Skills used: ${skills.join(", ") || "none"}`,
    `Connectors used: ${connectors.join(", ") || "none"}`,
    `File types created: ${files.join(", ") || "none"}`,
  ].join("\n");

  const out = await sarvamJson<{ category: string; task: string; summary: string }>(
    [
      {
        role: "system",
        content:
          "You label workplace AI-assistant sessions for a company's internal adoption analytics. " +
          "Labels must be generic and reusable: never include names of people or companies, numbers, dates, or file names. Reply with JSON only.",
      },
      {
        role: "user",
        content: [
          `Existing categories for this company: ${categories.length ? categories.join(" | ") : "(none yet)"}`,
          `Existing tasks (label — category):\n${tasks.map((t) => `- ${t.label} — ${t.category}`).join("\n") || "(none yet)"}`,
          "",
          "Session:",
          session,
          "",
          "Return:",
          `- category: the kind of work, by function, not the company's industry (every session is from the same company, so "Insurance" or "Banking" alone is useless). Reuse an existing category if one reasonably fits; otherwise create one in 2-4 words, e.g. "Client communication", "Claims handling", "Data & reporting", "Code & automation". The company should end up with 5-${MAX_CATEGORIES} categories.`,
          "- task: the recurring job, at the level a manager would write a skill for. Sessions doing the same job for different clients, people, amounts or reasons are the SAME task: reuse the existing label. Only create a new verb phrase (at most 8 words, no specifics) if no existing task is the same job, e.g. \"Draft follow-up emails after sales calls\".",
          "- summary: what this session did, at most 12 words.",
        ].join("\n"),
      },
    ],
    "session_label",
    {
      type: "object",
      properties: { category: { type: "string" }, task: { type: "string" }, summary: { type: "string" } },
      required: ["category", "task", "summary"],
      additionalProperties: false,
    },
  );

  const category = matchExisting(out.category, categories).slice(0, 40) || "Other";
  const taskLabel = matchExisting(out.task, tasks.map((t) => t.label)).slice(0, 80);
  const summary = out.summary.trim().slice(0, 140);

  await sql`insert into categories (org_id, name) values (${org_id}, ${category}) on conflict do nothing`;
  let taskId: number | null = null;
  if (taskLabel) {
    const [t] = await sql<{ id: number }[]>`
      insert into tasks (org_id, label, category) values (${org_id}, ${taskLabel}, ${category})
      on conflict (org_id, label) do update set label = excluded.label returning id`;
    taskId = t.id;
  }
  await sql`update sessions set category = ${category}, task_id = ${taskId}, summary = ${summary}, classified_at = now()
            where id = ${id}`;
}

function matchExisting(value: string, existing: string[]) {
  const v = value.trim().replace(/\s+/g, " ");
  return existing.find((e) => e.toLowerCase() === v.toLowerCase()) ?? v;
}

/** Merges an org's categories down to at most MAX_CATEGORIES. */
export async function consolidateCategories(orgId: string) {
  const rows = await sql<{ name: string; sessions: number; examples: string[] }[]>`
    select c.name, count(distinct s.id)::int as sessions,
           (array_agg(distinct t.label))[1:5] as examples
    from categories c
    left join sessions s on s.org_id = c.org_id and s.category = c.name
    left join tasks t on t.org_id = c.org_id and t.category = c.name
    where c.org_id = ${orgId} group by c.name`;
  if (rows.length <= MAX_CATEGORIES) return;

  const out = await sarvamJson<{ mapping: { from: string; to: string }[] }>(
    [
      { role: "system", content: "You maintain a small taxonomy of work categories for a company's AI usage analytics. Reply with JSON only." },
      {
        role: "user",
        content:
          `Merge these categories into at most ${MAX_CATEGORIES} broad ones. Keep well-used names where possible.\n` +
          rows.map((r) => `- ${r.name} (${r.sessions} sessions; e.g. ${(r.examples ?? []).filter(Boolean).join("; ")})`).join("\n") +
          "\nReturn a mapping with one entry for every category above: from = the old name, to = the merged name.",
      },
    ],
    "category_merge",
    {
      type: "object",
      properties: {
        mapping: {
          type: "array",
          items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"], additionalProperties: false },
        },
      },
      required: ["mapping"],
      additionalProperties: false,
    },
    1500,
  );

  const targets = new Set(out.mapping.map((m) => m.to.trim()).filter(Boolean));
  if (!targets.size || targets.size > MAX_CATEGORIES) return; // model ignored the brief; try again next run
  await sql.begin(async (tx) => {
    for (const { from, to } of out.mapping) {
      const target = to.trim();
      if (!target || from === target) continue;
      await tx`update sessions set category = ${target} where org_id = ${orgId} and category = ${from}`;
      await tx`update tasks set category = ${target} where org_id = ${orgId} and category = ${from}`;
    }
    await tx`delete from categories where org_id = ${orgId}`;
    await tx`insert into categories (org_id, name)
             select distinct ${orgId}::uuid, category from sessions where org_id = ${orgId} and category is not null
             on conflict do nothing`;
  });
}

/** Drafts a SKILL.md for a recurring task from the prompts people used for it. */
export async function draftSkill(orgId: string, taskId: number) {
  const [task] = await sql<{ label: string; category: string }[]>`select label, category from tasks where id = ${taskId} and org_id = ${orgId}`;
  if (!task) throw new Error("task not found");
  const prompts = await sql<{ text: string }[]>`
    select p.text from sessions s
    join lateral (select text from prompts where session_id = s.id and text is not null order by ts limit 1) p on true
    where s.task_id = ${taskId} order by s.first_at desc limit 15`;
  const md = await sarvamText(
    [
      {
        role: "system",
        content:
          "You write Agent Skills (SKILL.md files) for Claude. Output only the SKILL.md content, starting with the --- frontmatter line. " +
          "Never include names of people or companies, client details, amounts or identifiers from the examples.",
      },
      {
        role: "user",
        content: [
          `Recurring task at this company: "${task.label}" (area: ${task.category}).`,
          "Example first prompts people sent for it (private details must not be copied):",
          ...prompts.map((p) => `- ${p.text.slice(0, 600).replace(/\s+/g, " ")}`),
          "",
          "Write a SKILL.md:",
          "- frontmatter: name (lowercase-with-hyphens, max 64 chars) and description (what it does and when to use it, max 2 sentences)",
          "- ## Inputs: what the user must provide",
          "- ## Steps: numbered, including checks that make the result reliable",
          "- ## Output: format, structure and length",
          "- ## Gotchas: likely mistakes to avoid",
        ].join("\n"),
      },
    ],
    2500,
  );
  const clean = md.replace(/^```(?:markdown|md)?\s*\n?|\n?```\s*$/g, "").trim();
  await sql`update tasks set draft_md = ${clean} where id = ${taskId}`;
  return clean;
}
