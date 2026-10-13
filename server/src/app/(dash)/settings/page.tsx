import { headers } from "next/headers";
import { requireOrg } from "@/lib/auth";
import { changePassword, rotateToken, updateSeats } from "@/lib/actions";
import { ActionForm, RotateToken } from "@/components/forms";
import { Button, Card, Code, Input } from "@/components/ui";

export default async function Settings() {
  const org = await requireOrg();
  const h = await headers();
  const base = process.env.COMMONS_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const host = new URL(base).host;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Card title="Step 1 · Download your plugin" sub="Commons comes as a plugin with your org token built in. It sends no names or emails.">
          <form method="post" action="/api/plugin" className="flex flex-wrap items-end gap-2">
            <label className="block min-w-64 flex-1">
              <span className="mb-1 block text-[13px] font-medium">Org token</span>
              <Input name="token" type="password" placeholder="cmn_…" required />
            </label>
            <Button>Download plugin (.zip)</Button>
          </form>
          <p className="mt-2 text-[13px] text-muted">Use the token from your setup email, or create a new one on the right (older plugin files then stop working). Keep the file inside your organization.</p>
        </Card>

        <Card title="Step 2 · Add it for everyone" sub="Claude organization settings (Owner). On a personal plan, the same screens are under Settings.">
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
            <li><b>Plugins › Add › Upload plugin</b>, then choose the .zip. On Team and Enterprise, set its default access to <b>Required</b> so everyone gets it.</li>
            <li><b>Capabilities › Network egress</b>: allow <code className="font-mono">{host}</code>. Cowork blocks unknown sites, and the plugin can&apos;t reach Commons without this.</li>
          </ol>
        </Card>

        <Card title="Step 3 · Check it works" sub="Start a new Cowork session, run one task, then open Live events.">
          <p className="text-[13px]">Plugin events should appear within seconds, and the session gets a category and task a minute or two later. Nothing arriving usually means the network egress step is missing.</p>
        </Card>

        <Card title="Optional · Claude's monitoring export" sub="Team and Enterprise: Admin settings › Cowork › Monitoring. Adds who did what, tokens and cost. Skip it to keep Commons anonymous.">
          <div className="space-y-2 text-[13px]">
            <Row k="OTLP endpoint" v={base} />
            <Row k="OTLP protocol" v="http/json" />
            <Row k="OTLP headers" v="Authorization=Bearer <your org token>" />
          </div>
        </Card>

        <Card title="Optional · Claude Code monitoring" sub="Admin settings › Claude Code › Managed settings. Only needed if you also want people, tokens and cost for Claude Code.">
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
        <Card title="Org token" sub="Built into your plugin file. It can only send data to Commons, not read it.">
          <RotateToken action={rotateToken} />
        </Card>
        <Card title="Dashboard password">
          <ActionForm action={changePassword} submit="Change password" fields={[{ name: "password", label: "New password", type: "password", required: true }]} />
        </Card>
        <Card title="What is stored">
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-muted">
            <li>Prompt text, for labelling; deleted after 30 days</li>
            <li>Skill, connector and tool names; file extensions</li>
            <li>No names or emails, unless you turn on the monitoring export</li>
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
