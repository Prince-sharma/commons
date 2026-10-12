import { sql } from "@/lib/db";
import { requireSuperadmin } from "@/lib/auth";
import { createOrg } from "@/lib/actions";
import { ActionForm } from "@/components/forms";
import { Card, ago } from "@/components/ui";

export default async function Setup() {
  await requireSuperadmin();
  const orgs = await sql<{ name: string; slug: string; seats: number | null; created_at: Date; sessions: number; last: Date | null }[]>`
    select o.name, o.slug, o.seats, o.created_at, count(s.id)::int as sessions, max(s.last_at) as last
    from orgs o left join sessions s on s.org_id = o.id group by o.id order by o.created_at desc`;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Commons setup</h1>
      <Card title="Add an organization" sub="Creates the org's dashboard login and the token its admin pastes into Claude's monitoring settings.">
        <ActionForm
          action={createOrg}
          submit="Create organization"
          fields={[
            { name: "name", label: "Organization name", placeholder: "Acme Insurance", required: true },
            { name: "seats", label: "Claude seats (optional)", type: "number", placeholder: "6" },
          ]}
        />
      </Card>
      <Card title="Organizations">
        <table className="w-full text-[13px]">
          <thead className="text-left text-muted">
            <tr><th className="py-1.5 font-medium">Name</th><th className="font-medium">ID</th><th className="font-medium">Seats</th><th className="font-medium">Sessions</th><th className="font-medium">Last event</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.slug} className="border-t border-line">
                <td className="py-2">{o.name}</td><td className="font-mono">{o.slug}</td><td>{o.seats ?? "–"}</td><td>{o.sessions}</td><td>{ago(o.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
