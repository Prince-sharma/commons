import { headers } from "next/headers";
import { requireOrg } from "@/lib/auth";
import { changePassword, rotateToken, updateSeats } from "@/lib/actions";
import { ActionForm, RotateToken } from "@/components/forms";
import { Button, Card, Code, Input } from "@/components/ui";

export default async function Settings() {
  const org = await requireOrg();
  const h = await headers();
  const base = process.env.COMMONS_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const repo = process.env.COMMONS_PLUGIN_REPO ?? "Prince-sharma/commons";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Card title="Optional · Point Claude's monitoring at Commons" sub="Claude admin settings › Cowork › Monitoring (Owner, Team and Enterprise). Skip it to stay anonymous: Commons then counts skills and tasks but not people, tokens or cost.">
          <div className="space-y-2 text-[13px]">
            <Row k="OTLP endpoint" v={base} />
            <Row k="OTLP protocol" v="http/json" />
            <Row k="OTLP headers" v="Authorization=Bearer <your org token>" />
            <p className="text-muted">Use the org token from your setup email, or create a new one on the right. Settings apply to <b>new</b> Cowork sessions.</p>
          </div>
        </Card>

        <Card title="Add the Commons plugin for everyone" sub="Claude organization settings › Plugins & skills (Owner). No GitHub sync, or skipping monitoring? Upload a plugin file with your org token built in instead (Add › Upload plugin); ask us for it.">
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
            <li><b>Add › Sync from GitHub</b>, then pick <code className="font-mono">{repo}</code> (public). Leave <b>Sync automatically</b> on.</li>
            <li>On the <b>Inventory</b> tab, open the <code className="font-mono">commons</code> row › <b>Default access</b> › <b>Required</b>.</li>
            <li>If your org restricts network egress, add <code className="font-mono">{new URL(base).host}</code> under Organization settings › Capabilities › Network egress.</li>
          </ol>
          <p className="mt-2 text-[13px] text-muted">The plugin adds skill and connector names, file types, <code className="font-mono">/commons:my-usage</code> and <code className="font-mono">/commons:share-skill</code>. It carries no secrets.</p>
        </Card>

        <Card title="Check it works" sub="Start a new Cowork session, run one task that uses a skill, then open Live events.">
          <p className="text-[13px]">You should see <b>monitoring</b> and <b>plugin</b> events within a minute, and &quot;Plugin sessions matched to a person&quot; above zero. If plugin events arrive but never match, tell us: we switch your org to a plugin copy with your token built in.</p>
        </Card>

        <Card title="Optional · Claude Code users" sub="Admin settings › Claude Code › Managed settings. Developers get the plugin through account sync once it is Required.">
          <Code>{JSON.stringify({
            env: {
              CLAUDE_CODE_ENABLE_TELEMETRY: "1",
              OTEL_LOGS_EXPORTER: "otlp",
              OTEL_METRICS_EXPORTER: "none",
              OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
              OTEL_EXPORTER_OTLP_ENDPOINT: base,
              OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer <your org token>",
              OTEL_LOG_USER_PROMPTS: "1",
              OTEL_LOG_TOOL_DETAILS: "1",
            },
          }, null, 2)}</Code>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Organization">
          <dl className="space-y-1 text-[13px]">
            <div><dt className="inline text-muted">Organization ID: </dt><dd className="inline font-mono">{org.slug}</dd></div>
          </dl>
          <form action={updateSeats} className="mt-3 flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-[13px] font-medium">Claude seats</span>
              <Input name="seats" type="number" defaultValue={org.seats ?? ""} />
            </label>
            <Button variant="outline">Save</Button>
          </form>
        </Card>
        <Card title="Org token" sub="Used only to send data to Commons. It can't read anything.">
          <RotateToken action={rotateToken} />
        </Card>
        <Card title="Dashboard password">
          <ActionForm action={changePassword} submit="Change password" fields={[{ name: "password", label: "New password", type: "password", required: true }]} />
        </Card>
        <Card title="What is stored">
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-muted">
            <li>Prompt text, for labelling; deleted after 30 days</li>
            <li>Skill, connector and tool names; file extensions</li>
            <li>Email, tokens, cost and model from the monitoring export</li>
            <li>Never: file contents or paths, Claude&apos;s replies, tool outputs</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-32 text-muted">{k}</span>
      <code className="rounded border border-line bg-soft px-2 py-1 font-mono text-[12px]">{v}</code>
    </div>
  );
}
