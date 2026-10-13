import { sql } from "@/lib/db";

// Used by /commons:my-usage. The caller passes its Claude session id (an unguessable UUID); we answer
// for the person the monitoring stream tied that session to, or, when Commons runs anonymously,
// with what the whole organization uses. Plain text, so the skill can show it as is.
export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get("session")?.slice(0, 100);
  if (!sid) return text("Missing ?session=<CLAUDE_SESSION_ID>.", 400);
  const [s] = await sql<{ org_id: string | null; email: string | null }[]>`select org_id, email from sessions where id = ${sid}`;
  if (!s?.org_id) {
    return text("Commons hasn't seen this session yet. Check that your admin allowed network access to Commons, then try again after your next prompt.");
  }
  if (!s.email) return text(await orgView(s.org_id));
  const [me] = await sql<{ sessions: number; prompts: number; skill_sessions: number; cost: number }[]>`
    select count(distinct s.id)::int as sessions,
           (select count(*)::int from prompts p join sessions x on x.id = p.session_id
             where x.org_id = ${s.org_id} and x.email = ${s.email} and p.ts > now() - interval '7 days') as prompts,
           count(distinct s.id) filter (where exists (select 1 from tool_events t where t.session_id = s.id and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')))::int as skill_sessions,
           coalesce(sum(s.cost_usd), 0)::float as cost
    from sessions s where s.org_id = ${s.org_id} and s.email = ${s.email} and s.first_at > now() - interval '7 days'`;
  const cats = await sql<{ category: string; n: number }[]>`
    select category, count(*)::int as n from sessions
    where org_id = ${s.org_id} and email = ${s.email} and first_at > now() - interval '7 days' and category is not null
    group by 1 order by 2 desc limit 5`;
  const mine = await sql<{ skill_key: string; n: number }[]>`
    select t.skill_key, count(distinct t.prompt_id)::int as n from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${s.org_id} and s.email = ${s.email} and t.ts > now() - interval '7 days' and t.skill_key is not null
    group by 1 order by 2 desc limit 8`;
  const popular = await sql<{ skill_key: string; people: number }[]>`
    select t.skill_key, count(distinct s.email)::int as people from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${s.org_id} and t.ts > now() - interval '30 days' and t.skill_key is not null
      and t.skill_key not in ('share-skill', 'my-usage') and s.email <> ${s.email}
      and t.skill_key not in (select t2.skill_key from tool_events t2 join sessions s2 on s2.id = t2.session_id
                              where s2.org_id = ${s.org_id} and s2.email = ${s.email} and t2.skill_key is not null)
    group by 1 having count(distinct s.email) >= 2 order by 2 desc limit 3`;

  const lines = [
    `Your Claude usage, last 7 days (${s.email})`,
    `- Sessions: ${me.sessions}, prompts: ${me.prompts}`,
    `- Sessions that used a skill: ${me.skill_sessions} of ${me.sessions}`,
    me.cost > 0 ? `- Estimated model cost: $${me.cost.toFixed(2)}` : null,
    `- Main kinds of work: ${cats.map((c) => `${c.category} (${c.n})`).join(", ") || "not labelled yet"}`,
    `- Skills you ran: ${mine.map((m) => `${m.skill_key} (${m.n})`).join(", ") || "none"}`,
    popular.length ? `Colleagues also use: ${popular.map((p) => `${p.skill_key} (${p.people} people)`).join(", ")}` : null,
  ];
  return text(lines.filter(Boolean).join("\n"));
}

async function orgView(orgId: string) {
  const skills = await sql<{ skill_key: string; runs: number }[]>`
    select t.skill_key, count(distinct (t.prompt_id, t.skill_key))::int as runs
    from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${orgId} and t.ts > now() - interval '30 days' and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')
    group by 1 order by 2 desc limit 8`;
  const cats = await sql<{ category: string; n: number }[]>`
    select category, count(*)::int as n from sessions
    where org_id = ${orgId} and first_at > now() - interval '30 days' and category is not null
    group by 1 order by 2 desc limit 5`;
  const tasks = await sql<{ label: string; n: number }[]>`
    select k.label, count(*)::int as n from sessions s join tasks k on k.id = s.task_id
    where s.org_id = ${orgId} and s.first_at > now() - interval '30 days'
    group by 1 order by 2 desc limit 5`;
  return [
    "How your organization uses Claude, last 30 days",
    `- Most-used skills: ${skills.map((k) => `${k.skill_key} (${k.runs} runs)`).join(", ") || "none yet"}`,
    `- Main kinds of work: ${cats.map((c) => `${c.category} (${c.n})`).join(", ") || "not labelled yet"}`,
    `- Most common tasks: ${tasks.map((t) => `${t.label} (${t.n})`).join("; ") || "not labelled yet"}`,
  ].join("\n");
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
