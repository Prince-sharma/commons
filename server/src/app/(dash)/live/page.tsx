import { sql } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { Badge, Card, Empty, Stat, ago } from "@/components/ui";
import { AutoRefresh } from "@/components/refresh";

// Install-day check: is monitoring arriving, are hooks arriving, and can the two be matched?
export default async function Live() {
  const org = await requireOrg();
  const [health] = await sql<{ last_otel: Date | null; last_hook: Date | null; hook_sessions: number; matched: number; otel_sessions: number }[]>`
    select (select max(ts) from live_events where org_id = ${org.id} and source = 'otel') as last_otel,
           (select max(ts) from live_events where org_id = ${org.id} and source = 'hook') as last_hook,
           count(*) filter (where has_hooks)::int as hook_sessions,
           count(*) filter (where has_hooks and has_otel)::int as matched,
           count(*) filter (where has_otel)::int as otel_sessions
    from sessions where org_id = ${org.id} and last_at > now() - interval '24 hours'`;
  const [{ unmatched }] = await sql<{ unmatched: number }[]>`
    select count(*)::int as unmatched from sessions where org_id is null and last_at > now() - interval '1 hour'`;
  const events = await sql<{ id: number; ts: Date; source: string; kind: string; detail: string | null; session_id: string | null; email: string | null }[]>`
    select l.id, l.ts, l.source, l.kind, l.detail, l.session_id, s.email
    from live_events l left join sessions s on s.id = l.session_id
    where l.org_id = ${org.id} order by l.id desc limit 100`;

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={5} />
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Claude monitoring export" value={health.last_otel ? ago(health.last_otel) : "not seen"} sub={`${health.otel_sessions} sessions in 24h`} />
        <Stat label="Commons plugin hooks" value={health.last_hook ? ago(health.last_hook) : "not seen"} sub={`${health.hook_sessions} sessions in 24h`} />
        <Stat
          label="Plugin sessions matched to a person"
          value={health.hook_sessions ? `${health.matched} of ${health.hook_sessions}` : "–"}
          sub={unmatched ? `${unmatched} unmatched plugin sessions on this server in the last hour` : "no unmatched plugin sessions"}
        />
      </div>
      <Card title="Events" sub="Newest first, refreshes every 5 s. Content is never shown or stored here.">
        {events.length ? (
          <table className="w-full text-[13px]">
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-line first:border-0">
                  <td className="w-20 py-1.5 text-muted tabular-nums">{new Date(e.ts).toLocaleTimeString("en-GB")}</td>
                  <td className="w-20"><Badge tone={e.source === "otel" ? "good" : "neutral"}>{e.source === "otel" ? "monitoring" : "plugin"}</Badge></td>
                  <td className="w-44 font-medium">{e.kind}</td>
                  <td className="text-muted">{e.detail}</td>
                  <td className="hidden text-right text-muted md:table-cell">{e.email ?? `session ${e.session_id?.slice(0, 8)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Waiting for the first event. Start a new Cowork session after saving the monitoring settings.</Empty>}
      </Card>
    </div>
  );
}
