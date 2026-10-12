import { sql } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import * as m from "@/lib/metrics";
import { dismissSuggestion, draftSkillAction, reviewSubmission } from "@/lib/actions";
import { Badge, Button, Card, Code, Empty, Sparkline, ago, pct } from "@/components/ui";

const BUILTIN = new Set(["docx", "xlsx", "pptx", "pdf", "skill-creator", "canvas-design", "frontend-design", "web-artifacts-builder"]);

export default async function Skills() {
  const org = await requireOrg();
  const [skills, suggested, subs] = await Promise.all([
    m.topSkills(org.id, 100),
    m.suggestions(org.id),
    sql<{ id: number; name: string | null; email: string | null; skill_md: string; status: string; created_at: Date }[]>`
      select id, name, email, skill_md, status, created_at from submissions where org_id = ${org.id} order by created_at desc limit 50`,
  ]);
  const examples = Object.fromEntries(
    await Promise.all(suggested.slice(0, 10).map(async (t) => [t.id, await m.examplePrompts(org.id, t.id)] as const)),
  );
  const pending = subs.filter((s) => s.status === "pending");

  return (
    <div className="space-y-5">
      <Card title="Skills in use" sub="Every skill people ran in the last 30 days, ranked by runs. Share a good one with everyone from Organization settings › Plugins & skills.">
        {skills.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="text-left text-muted"><tr><th className="pb-1.5 font-medium">Skill</th><th className="font-medium">Runs</th><th className="font-medium">People</th><th className="font-medium">Typed as /command</th><th className="font-medium">Last run</th><th className="font-medium">8 weeks</th></tr></thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.skill_key} className="border-t border-line">
                    <td className="py-1.5 font-medium">{s.skill_key} {BUILTIN.has(s.skill_key) && <Badge>built-in</Badge>}</td>
                    <td className="tabular-nums">{s.runs}</td>
                    <td className="tabular-nums">{s.people}</td>
                    <td className="tabular-nums">{s.user_typed}</td>
                    <td className="text-muted">{ago(s.last_run)}</td>
                    <td><Sparkline values={s.weekly} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No skill runs yet.</Empty>}
      </Card>

      <div id="suggested" />
      <Card title={`Suggested skills (${suggested.length})`} sub="Recurring tasks (3+ sessions) where fewer than 20% of sessions used a skill. Draft a SKILL.md with Sarvam, check it, then add it in Organization settings › Plugins & skills › Add › Upload a skill.">
        {suggested.length ? (
          <ul className="space-y-4">
            {suggested.map((t) => (
              <li key={t.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-[12px] text-muted">{t.category} · {t.people} people · {t.sessions} sessions · {t.prompts_per_session} prompts per session · {pct(t.skill_share)} used a skill</div>
                  </div>
                  <div className="flex gap-2">
                    <form action={draftSkillAction}><input type="hidden" name="taskId" value={t.id} /><Button>{t.draft_md ? "Redraft" : "Draft skill"}</Button></form>
                    <form action={dismissSuggestion}><input type="hidden" name="taskId" value={t.id} /><Button variant="outline">Dismiss</Button></form>
                  </div>
                </div>
                {examples[t.id]?.length ? (
                  <div className="mt-3 text-[12px] text-muted">
                    Example prompts (admins only; deleted after 30 days):
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{examples[t.id].map((p, i) => <li key={i}>{p.text.slice(0, 220)}</li>)}</ul>
                  </div>
                ) : null}
                {t.draft_md && (
                  <div className="mt-3">
                    <p className="mb-1 text-[12px] text-warn">Check it contains no client names, people, amounts or IDs before sharing.</p>
                    <Code>{t.draft_md}</Code>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <Empty>No suggestions yet. They appear once a task recurs without a skill.</Empty>}
      </Card>

      <Card title={`Shared by employees (${pending.length} to review)`} sub="Skills people sent with /commons:share-skill.">
        {subs.length ? (
          <ul className="space-y-4">
            {subs.map((s) => (
              <li key={s.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium">{s.name ?? "Untitled skill"}</span>{" "}
                    <Badge tone={s.status === "approved" ? "good" : s.status === "returned" ? "warn" : "neutral"}>{s.status}</Badge>
                    <div className="text-[12px] text-muted">{s.email ?? "unknown author"} · {ago(s.created_at)}</div>
                  </div>
                  {s.status === "pending" && (
                    <div className="flex gap-2">
                      <form action={reviewSubmission}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="approved" /><Button>Approve</Button></form>
                      <form action={reviewSubmission}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="returned" /><Button variant="outline">Send back</Button></form>
                    </div>
                  )}
                </div>
                <details className="mt-2"><summary className="cursor-pointer text-[13px] text-muted">SKILL.md</summary><div className="mt-2"><Code>{s.skill_md}</Code></div></details>
              </li>
            ))}
          </ul>
        ) : <Empty>Nothing yet. Employees type /commons:share-skill at the end of a session that went well.</Empty>}
      </Card>
    </div>
  );
}
