import { sql } from "./db";

// Every number on the Analytics page. Window: last 30 days. A "skill run" is a distinct (prompt, skill) pair,
// which keeps counts right when hooks and the monitoring export both report the same run.

export async function overview(orgId: string) {
  const [t] = await sql<{
    people: number; sessions: number; skill_sessions: number; files: number; cost: number; unattributed: number; prompts: number;
    cowork: number; code: number;
  }[]>`
    with s as (select * from sessions where org_id = ${orgId} and first_at > now() - interval '30 days')
    select count(distinct email)::int as people,
           count(*)::int as sessions,
           count(*) filter (where exists (select 1 from tool_events t where t.session_id = s.id and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')))::int as skill_sessions,
           (select count(distinct (t.prompt_id, t.file_ext))::int from tool_events t join s on s.id = t.session_id where t.file_ext is not null) as files,
           (select count(*)::int from prompts p join s on s.id = p.session_id) as prompts,
           coalesce(sum(cost_usd), 0)::float as cost,
           count(*) filter (where email is null)::int as unattributed,
           count(*) filter (where surface = 'cowork')::int as cowork,
           count(*) filter (where surface = 'claude-code')::int as code
    from s`;
  return t;
}

export async function weeklyActive(orgId: string) {
  return sql<{ week: Date; people: number; sessions: number }[]>`
    select w.week, count(distinct s.email)::int as people, count(s.id)::int as sessions
    from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as w(week)
    left join sessions s on s.org_id = ${orgId} and date_trunc('week', s.first_at) = w.week
    group by w.week order by w.week`;
}

/** Light: 1–3 sessions. Regular: ≥4 sessions, skills/connectors in <3. Advanced: ≥4 sessions, skills/connectors in ≥3. */
export async function usageLevels(orgId: string, seats: number | null) {
  const rows = await sql<{ email: string; sessions: number; deep: number; skill_runs: number }[]>`
    select s.email, count(*)::int as sessions,
           count(*) filter (where exists (select 1 from tool_events t where t.session_id = s.id
                    and ((t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')) or t.mcp_server is not null)))::int as deep,
           (select count(distinct (t.prompt_id, t.skill_key))::int from tool_events t join sessions x on x.id = t.session_id
             where x.org_id = ${orgId} and x.email = s.email and t.skill_key is not null and t.ts > now() - interval '30 days') as skill_runs
    from sessions s where s.org_id = ${orgId} and s.email is not null and s.first_at > now() - interval '30 days'
    group by s.email`;
  const level = (r: (typeof rows)[number]) => (r.sessions < 4 ? "light" : r.deep >= 3 ? "advanced" : "regular");
  const counts = { light: 0, regular: 0, advanced: 0 };
  let advancedRuns = 0, allRuns = 0;
  for (const r of rows) {
    counts[level(r)]++;
    allRuns += r.skill_runs;
    if (level(r) === "advanced") advancedRuns += r.skill_runs;
  }
  const notActive = seats ? Math.max(0, seats - rows.length) : 0;
  return { ...counts, notActive, advancedShare: allRuns ? advancedRuns / allRuns : 0 };
}

export async function categories(orgId: string) {
  return sql<{ category: string; sessions: number; people: number; skill_share: number }[]>`
    select coalesce(category, 'Not labelled yet') as category, count(*)::int as sessions, count(distinct email)::int as people,
           avg(case when exists (select 1 from tool_events t where t.session_id = s.id and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')) then 1 else 0 end)::float as skill_share
    from sessions s where org_id = ${orgId} and first_at > now() - interval '30 days'
    group by 1 order by 2 desc`;
}

export async function topSkills(orgId: string, limit = 50) {
  return sql<{ skill_key: string; runs: number; people: number; last_run: Date; user_typed: number; weekly: number[] }[]>`
    select t.skill_key,
           count(distinct (t.prompt_id, t.skill_key))::int as runs,
           count(distinct s.email)::int as people,
           max(t.ts) as last_run,
           count(distinct t.prompt_id) filter (where t.invocation = 'user-slash')::int as user_typed,
           array(select count(distinct (t2.prompt_id))::int
                 from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w(week)
                 left join tool_events t2 on t2.skill_key = t.skill_key and date_trunc('week', t2.ts) = w.week
                   and t2.session_id in (select id from sessions where org_id = ${orgId})
                 group by w.week order by w.week) as weekly
    from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${orgId} and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage') and t.ts > now() - interval '30 days'
    group by t.skill_key order by runs desc limit ${limit}`;
}

export async function connectors(orgId: string) {
  return sql<{ mcp_server: string; calls: number; people: number }[]>`
    select t.mcp_server, count(*)::int as calls, count(distinct s.email)::int as people
    from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${orgId} and t.mcp_server is not null and t.ts > now() - interval '30 days'
    group by 1 order by 2 desc limit 10`;
}

export async function fileTypes(orgId: string) {
  return sql<{ file_ext: string; n: number }[]>`
    select t.file_ext, count(distinct (t.prompt_id, t.file_ext))::int as n
    from tool_events t join sessions s on s.id = t.session_id
    where s.org_id = ${orgId} and t.file_ext is not null and t.ts > now() - interval '30 days'
    group by 1 order by 2 desc limit 8`;
}

export type TaskRow = {
  id: number; label: string; category: string; people: number; sessions: number; prompts_per_session: number;
  top_skill: string | null; top_skill_share: number; skill_share: number; draft_md: string | null; dismissed: boolean;
};

export async function commonTasks(orgId: string) {
  return sql<TaskRow[]>`
    with s as (
      select s.*, (select count(*) from prompts p where p.session_id = s.id) as n_prompts
      from sessions s where s.org_id = ${orgId} and s.task_id is not null and s.first_at > now() - interval '30 days'
    ), skill as (
      select s.task_id, t.skill_key, count(distinct s.id) as n
      from s join tool_events t on t.session_id = s.id
      where t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage') group by 1, 2
    )
    select k.id, k.label, k.category, k.draft_md, k.dismissed,
           count(distinct s.email)::int as people, count(distinct s.id)::int as sessions,
           round(avg(s.n_prompts), 1)::float as prompts_per_session,
           (select skill_key from skill where skill.task_id = k.id order by n desc limit 1) as top_skill,
           coalesce((select max(n) from skill where skill.task_id = k.id), 0)::float / count(distinct s.id) as top_skill_share,
           (select count(distinct x.id) from s x where x.task_id = k.id and exists
             (select 1 from tool_events t where t.session_id = x.id and t.skill_key is not null and t.skill_key not in ('share-skill', 'my-usage')))::float
             / count(distinct s.id) as skill_share
    from tasks k join s on s.task_id = k.id
    where k.org_id = ${orgId}
    group by k.id order by sessions desc, people desc`;
}

/** Recurring work with little or no skill use: candidates for a new company skill. */
export async function suggestions(orgId: string) {
  const tasks = await commonTasks(orgId);
  return tasks
    .filter((t) => !t.dismissed && t.sessions >= 3 && t.skill_share < 0.2)
    .sort((a, b) => b.sessions * b.prompts_per_session - a.sessions * a.prompts_per_session);
}

export async function examplePrompts(orgId: string, taskId: number) {
  return sql<{ text: string }[]>`
    select p.text from sessions s
    join lateral (select text from prompts where session_id = s.id and text is not null order by ts limit 1) p on true
    where s.org_id = ${orgId} and s.task_id = ${taskId} order by s.first_at desc limit 3`;
}
