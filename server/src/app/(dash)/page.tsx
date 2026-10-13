import Link from "next/link";
import { after } from "next/server";
import { requireOrg } from "@/lib/auth";
import { maybeClassify } from "@/lib/classify";
import * as m from "@/lib/metrics";
import { Badge, Card, Empty, Meter, Sparkline, Stat, pct } from "@/components/ui";

export default async function Analytics() {
  const org = await requireOrg();
  after(() => maybeClassify().catch((e) => console.error("classify", e)));
  const [o, weeks, levels, cats, skills, tasks, files, conns] = await Promise.all([
    m.overview(org.id), m.weeklyActive(org.id), m.usageLevels(org.id, org.seats), m.categories(org.id),
    m.topSkills(org.id, 8), m.commonTasks(org.id), m.fileTypes(org.id), m.connectors(org.id),
  ]);

  if (o.sessions === 0) {
    return (
      <Card title="No data yet" sub="Commons fills in as soon as the first Claude session reaches it.">
        <p className="text-[13px] text-muted">
          Finish the two admin steps on the <Link className="underline" href="/settings">Settings</Link> page, start a new Cowork
          session, and watch <Link className="underline" href="/live">Live events</Link>.
        </p>
      </Card>
    );
  }

  const anon = o.people === 0; // no monitoring export: nothing ties sessions to people
  const surfaces = [o.cowork && `Cowork ${o.cowork}`, o.code && `Claude Code ${o.code}`].filter(Boolean).join(" · ");
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted">
        Last 30 days{surfaces ? ` · ${surfaces}` : ""}
        {anon ? " · anonymous (no monitoring export)" : o.unattributed > 0 && ` · ${o.unattributed} sessions not yet linked to a person`}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {anon
          ? <Stat label="Prompts" value={o.prompts} sub="across all sessions" />
          : <Stat label="Active people" value={o.people} sub={org.seats ? `of ${org.seats} seats` : "set seats in Settings"} />}
        <Stat label="Sessions" value={o.sessions} />
        <Stat label="Sessions using a skill" value={pct(o.sessions ? o.skill_sessions / o.sessions : 0)} sub={`${o.skill_sessions} sessions`} />
        <Stat label="Files created" value={o.files} sub={files.slice(0, 3).map((f) => `.${f.file_ext} ${f.n}`).join(" · ") || undefined} />
        {anon
          ? <Stat label="Connectors used" value={conns.length} sub={conns.slice(0, 2).map((c) => c.mcp_server).join(" · ") || undefined} />
          : <Stat label="Estimated model cost" value={`$${o.cost.toFixed(2)}`} sub="from Claude's monitoring export" />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={anon ? "Weekly sessions" : "Weekly active people"} sub={!anon && org.seats ? `Dashed line: ${org.seats} seats` : "Last 8 weeks"}>
          <WeeklyChart weeks={anon ? weeks.map((w) => ({ ...w, people: w.sessions })) : weeks} seats={anon ? null : org.seats} />
        </Card>

        <Card title="How people use Claude" sub="Per person, last 30 days">
          {anon ? <Empty>Per-person levels need the optional monitoring export (Settings). Commons is running anonymously.</Empty> : <Levels levels={levels} />}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What people use Claude for" sub="Sessions by kind of work, labelled by Sarvam; categories are learned from your own usage">
          {cats.length ? (
            <ul className="space-y-2.5">
              {cats.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span>{c.category}</span>
                    <span className="text-muted tabular-nums">{c.sessions} sessions{anon ? "" : ` · ${c.people} people`} · {pct(c.skill_share)} with a skill</span>
                  </div>
                  <Meter value={c.sessions} max={cats[0].sessions} />
                </li>
              ))}
            </ul>
          ) : <Empty>Sessions are labelled a minute or two after they start.</Empty>}
        </Card>

        <Card title="Top skills" sub="Runs = prompts that used the skill" action={<Link href="/skills" className="text-[13px] text-muted hover:text-ink">All skills →</Link>}>
          {skills.length ? (
            <table className="w-full text-[13px]">
              <thead className="text-left text-muted"><tr><th className="pb-1.5 font-medium">Skill</th><th className="font-medium">Runs</th><th className="font-medium">People</th><th className="font-medium">8 weeks</th></tr></thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.skill_key} className="border-t border-line">
                    <td className="py-1.5 font-medium">{s.skill_key}</td>
                    <td className="tabular-nums">{s.runs}</td>
                    <td className="tabular-nums">{s.people}</td>
                    <td><Sparkline values={s.weekly} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No skill runs yet.</Empty>}
          {conns.length > 0 && (
            <p className="mt-3 text-[12px] text-muted">Connectors: {conns.map((c) => `${c.mcp_server} (${c.calls})`).join(" · ")}</p>
          )}
        </Card>
      </div>

      <Card title="Common tasks" sub="Recurring jobs, grouped across people. Many prompts per session and no skill = a good candidate for a new skill.">
        {tasks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="text-left text-muted">
                <tr><th className="pb-1.5 font-medium">Task</th><th className="font-medium">Category</th>{!anon && <th className="font-medium">People</th>}<th className="font-medium">Sessions</th><th className="font-medium">Prompts / session</th><th className="font-medium">Skill used</th></tr>
              </thead>
              <tbody>
                {tasks.slice(0, 25).map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-1.5 pr-3">{t.label}</td>
                    <td className="text-muted">{t.category}</td>
                    {!anon && <td className="tabular-nums">{t.people}</td>}
                    <td className="tabular-nums">{t.sessions}</td>
                    <td className="tabular-nums">{t.prompts_per_session >= 6 ? <Badge tone="warn">{t.prompts_per_session}</Badge> : t.prompts_per_session}</td>
                    <td>{t.top_skill ? `${t.top_skill} (${pct(t.top_skill_share)})` : <Link href="/skills#suggested" className="text-muted underline">No skill</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Tasks appear once sessions are labelled.</Empty>}
      </Card>
    </div>
  );
}

function WeeklyChart({ weeks, seats }: { weeks: { week: Date; people: number }[]; seats: number | null }) {
  const W = 520, H = 170, pad = 24;
  const max = Math.max(1, seats ?? 0, ...weeks.map((w) => w.people));
  const bw = (W - pad) / weeks.length;
  const y = (v: number) => H - pad - (v / max) * (H - pad - 18);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly active people, last 8 weeks">
      {weeks.map((w, i) => (
        <g key={i}>
          <rect x={pad + i * bw + 6} y={y(w.people)} width={bw - 12} height={H - pad - y(w.people)} rx="3" fill="var(--data)" />
          <text x={pad + i * bw + bw / 2} y={y(w.people) - 4} textAnchor="middle" fontSize="11" fill="var(--ink)">{w.people}</text>
          <text x={pad + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
            {new Date(w.week).toLocaleDateString("en", { day: "numeric", month: "short" })}
          </text>
        </g>
      ))}
      {seats ? <line x1={pad} x2={W} y1={y(seats)} y2={y(seats)} stroke="var(--muted)" strokeDasharray="4 4" /> : null}
    </svg>
  );
}

function Levels({ levels }: { levels: Awaited<ReturnType<typeof m.usageLevels>> }) {
  const parts = [
    { key: "Not active", n: levels.notActive, color: "var(--soft)", def: "Seat with no session" },
    { key: "Light", n: levels.light, color: "var(--lvl1)", def: "1–3 sessions" },
    { key: "Regular", n: levels.regular, color: "var(--lvl2)", def: "4+ sessions, few with skills or connectors" },
    { key: "Advanced", n: levels.advanced, color: "var(--lvl3)", def: "4+ sessions, skills or connectors in 3+" },
  ];
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  return (
    <div className="space-y-4">
      <div className="flex h-7 overflow-hidden rounded-md border border-line">
        {parts.filter((p) => p.n).map((p) => (
          <div key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.key}: ${p.n}`} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 text-[13px]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2">
            <span className="mt-1 inline-block size-2.5 shrink-0 rounded-sm border border-line" style={{ background: p.color }} />
            <span><span className="font-medium">{p.key}: {p.n}</span><br /><span className="text-muted">{p.def}</span></span>
          </li>
        ))}
      </ul>
      {levels.advanced > 0 && (
        <p className="text-[13px]">The {levels.advanced} advanced {levels.advanced === 1 ? "user runs" : "users run"} {pct(levels.advancedShare)} of all skill runs.</p>
      )}
    </div>
  );
}
