import { sql } from "./db";

/*
 * Two inputs, one session model:
 *  - plugin hooks (POST /api/hooks): what happened, keyed by session_id; org known only if the plugin carries a token
 *  - Claude monitoring export (POST /v1/logs, OTLP/JSON): who + how much, always org-authenticated
 * A session's org and email come from whichever source can vouch for them first; hook-only sessions
 * stay unattributed until the monitoring stream claims the same session id.
 *
 * Privacy: file contents/paths, tool outputs, assistant responses and folder paths are dropped here.
 */

type Source = "hook" | "otel";

// Claude Code / Cowork built-in commands: a prompt starting with one of these is not a skill run.
const BUILTIN_COMMANDS = new Set([
  "add-dir", "agents", "btw", "bug", "clear", "compact", "config", "context", "cost", "doctor", "effort",
  "exit", "export", "fast", "help", "hooks", "ide", "init", "install-github-app", "login", "logout", "loop",
  "mcp", "memory", "model", "output-style", "permissions", "plugin", "plugins", "pr-comments", "release-notes",
  "resume", "review", "rewind", "schedule", "security-review", "status", "statusline", "terminal-setup",
  "theme", "todos", "upgrade", "usage", "vim", "workflows", "skills",
]);

export function normSkill(raw: string) {
  const s = raw.trim().toLowerCase().replace(/^\//, "");
  return s.slice(s.lastIndexOf(":") + 1);
}

export function slashSkill(prompt: string | null | undefined): string | null {
  const m = /^\/([a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)?)(?:\s|$)/i.exec(prompt?.trim() ?? "");
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!name.includes(":") && BUILTIN_COMMANDS.has(name)) return null;
  return name;
}

function fileExt(path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase().slice(0, 12) : null;
}

function splitMcp(toolName: string) {
  // mcp__<server>__<tool>; plugin servers look like mcp__plugin_<plugin>_<server>__<tool>
  const [, server = "", tool = ""] = toolName.split("__");
  return { server: server.replace(/^plugin_[^_]+_/, ""), tool };
}

/** Upserts a session. Returns the org the session belongs to after the upsert. */
export async function touchSession(
  id: string,
  o: { source: Source; orgId?: string | null; email?: string | null; surface?: string | null; at?: Date },
): Promise<string | null> {
  const at = o.at ?? new Date();
  const [row] = await sql<{ org_id: string | null; prev_org: string | null }[]>`
    with prev as (select org_id from sessions where id = ${id})
    insert into sessions (id, org_id, email, surface, first_at, last_at, has_hooks, has_otel)
    values (${id}, ${o.orgId ?? null}, ${o.email ?? null}, ${o.surface ?? null}, ${at}, ${at},
            ${o.source === "hook"}, ${o.source === "otel"})
    on conflict (id) do update set
      org_id    = coalesce(sessions.org_id, excluded.org_id),
      email     = coalesce(sessions.email, excluded.email),
      surface   = coalesce(sessions.surface, excluded.surface),
      first_at  = least(sessions.first_at, excluded.first_at),
      last_at   = greatest(sessions.last_at, excluded.last_at),
      has_hooks = sessions.has_hooks or excluded.has_hooks,
      has_otel  = sessions.has_otel or excluded.has_otel
    returning org_id, (select org_id from prev) as prev_org`;
  if (row.org_id && !row.prev_org) {
    // The session was just claimed: attach anything that arrived before we knew the org.
    await sql`update live_events set org_id = ${row.org_id} where session_id = ${id} and org_id is null`;
    await sql`update submissions set org_id = ${row.org_id} where session_id = ${id} and org_id is null`;
  }
  return row.org_id;
}

async function live(orgId: string | null, sessionId: string | null, source: Source, kind: string, detail?: string) {
  await sql`insert into live_events (org_id, session_id, source, kind, detail)
            values (${orgId}, ${sessionId}, ${source}, ${kind}, ${detail ?? null})`;
}

async function upsertPrompt(p: { id: string; sessionId: string; ts: Date; text: string | null; length?: number | null }) {
  const slash = slashSkill(p.text);
  await sql`
    insert into prompts (id, session_id, ts, text, length, slash_skill)
    values (${p.id}, ${p.sessionId}, ${p.ts}, ${p.text}, ${p.length ?? p.text?.length ?? null}, ${slash})
    on conflict (id) do update set
      text = coalesce(prompts.text, excluded.text),
      length = coalesce(prompts.length, excluded.length),
      slash_skill = coalesce(prompts.slash_skill, excluded.slash_skill)`;
  if (slash) {
    await insertTool({
      dedupKey: `slash:${p.id}`, sessionId: p.sessionId, promptId: p.id, ts: p.ts, source: "hook",
      toolName: "Skill", skillRaw: slash, invocation: "user-slash",
    });
  }
}

type ToolRow = {
  dedupKey: string; sessionId: string; promptId?: string | null; ts: Date; source: Source; toolName: string;
  skillRaw?: string | null; invocation?: string | null; mcpServer?: string | null; mcpTool?: string | null;
  fileExt?: string | null; success?: boolean | null;
};

async function insertTool(t: ToolRow) {
  await sql`
    insert into tool_events (dedup_key, session_id, prompt_id, ts, source, tool_name, skill_key, skill_raw,
                             invocation, mcp_server, mcp_tool, file_ext, success)
    values (${t.dedupKey}, ${t.sessionId}, ${t.promptId ?? null}, ${t.ts}, ${t.source}, ${t.toolName},
            ${t.skillRaw ? normSkill(t.skillRaw) : null}, ${t.skillRaw ?? null}, ${t.invocation ?? null},
            ${t.mcpServer ?? null}, ${t.mcpTool ?? null}, ${t.fileExt ?? null}, ${t.success ?? null})
    on conflict (dedup_key) do nothing`;
}

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Turns a tool name + its input into the fields we keep. Input may be an object or a (possibly truncated) JSON string. */
function describeTool(toolName: string, input: unknown) {
  let obj: Record<string, unknown> = {};
  let raw = "";
  if (typeof input === "string") {
    raw = input;
    try { obj = JSON.parse(input); } catch { /* truncated: fall back to regex below */ }
  } else if (input && typeof input === "object") {
    obj = input as Record<string, unknown>;
  }
  const pick = (k: string) =>
    typeof obj[k] === "string" ? (obj[k] as string) : new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`).exec(raw)?.[1] ?? null;

  if (toolName === "Skill") return { skillRaw: pick("skill") ?? pick("skill_name") ?? pick("command") };
  if (toolName.startsWith("mcp__")) {
    const { server, tool } = splitMcp(toolName);
    return { mcpServer: server, mcpTool: tool };
  }
  if (FILE_TOOLS.has(toolName)) return { fileExt: fileExt(pick("file_path") ?? pick("notebook_path")) };
  return {};
}

// ---------------------------------------------------------------- hooks

export type HookEvent = {
  hook_event_name?: string;
  session_id?: string;
  prompt_id?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  error?: string;
};

export async function ingestHook(e: HookEvent, bearerOrgId: string | null) {
  const sid = e.session_id;
  if (!sid || typeof sid !== "string") return;
  const now = new Date();
  const orgId = await touchSession(sid, { source: "hook", orgId: bearerOrgId, at: now });

  switch (e.hook_event_name) {
    case "UserPromptSubmit": {
      const text = typeof e.prompt === "string" ? e.prompt.slice(0, 20_000) : null;
      // Fall back to our own id if a surface leaves prompt_id out, so the prompt still gets labelled.
      await upsertPrompt({ id: e.prompt_id ?? `hook:${sid}:${now.getTime()}`, sessionId: sid, ts: now, text });
      await live(orgId, sid, "hook", "UserPromptSubmit", `${text?.length ?? 0} chars${slashSkill(text) ? ` · /${slashSkill(text)}` : ""}`);
      break;
    }
    case "PostToolUse":
    case "PostToolUseFailure": {
      const tool = e.tool_name ?? "unknown";
      const d = describeTool(tool, e.tool_input);
      const promptId = e.prompt_id ?? (await latestPrompt(sid));
      await insertTool({
        dedupKey: e.tool_use_id ? `tool:${e.tool_use_id}` : `hook:${sid}:${promptId}:${tool}:${now.getTime()}`,
        sessionId: sid, promptId, ts: now, source: "hook", toolName: tool,
        invocation: tool === "Skill" ? "model" : null, success: e.hook_event_name === "PostToolUse", ...d,
      });
      await live(orgId, sid, "hook", e.hook_event_name, [tool, d.skillRaw, d.mcpServer, d.fileExt && `.${d.fileExt}`].filter(Boolean).join(" · "));
      break;
    }
    case "Stop":
      await live(orgId, sid, "hook", "Stop");
      break;
    default:
      await live(orgId, sid, "hook", e.hook_event_name ?? "unknown");
  }
}

async function latestPrompt(sessionId: string) {
  const [p] = await sql<{ id: string }[]>`select id from prompts where session_id = ${sessionId} order by ts desc limit 1`;
  return p?.id ?? null;
}

// ---------------------------------------------------------------- OTLP logs

type AnyValue = {
  stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean;
  arrayValue?: { values?: AnyValue[] };
};
type KV = { key: string; value?: AnyValue };
type OtlpLogs = {
  resourceLogs?: {
    resource?: { attributes?: KV[] };
    scopeLogs?: { logRecords?: { timeUnixNano?: string; attributes?: KV[]; body?: AnyValue }[] }[];
  }[];
};

function val(v?: AnyValue): string | number | boolean | null {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  return null;
}

function flatten(kvs?: KV[]) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const kv of kvs ?? []) out[kv.key] = val(kv.value);
  return out;
}

const str = (v: unknown) => (typeof v === "string" && v !== "" && v !== "<REDACTED>" ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function ingestOtlp(body: OtlpLogs, orgId: string) {
  let records = 0;
  for (const rl of body.resourceLogs ?? []) {
    const res = flatten(rl.resource?.attributes);
    const surface = str(res["service.name"]);
    for (const sl of rl.scopeLogs ?? []) {
      for (const rec of sl.logRecords ?? []) {
        records++;
        const a = flatten(rec.attributes);
        const event = String(a["event.name"] ?? val(rec.body) ?? "").replace(/^claude_code\./, "");
        const sid = str(a["session.id"]);
        if (!sid) continue;
        const email = str(a["user.email"])?.toLowerCase() ?? null;
        const ts = str(a["event.timestamp"]) ? new Date(String(a["event.timestamp"]))
          : rec.timeUnixNano ? new Date(Number(rec.timeUnixNano.slice(0, -6))) : new Date();
        const seq = a["event.sequence"];
        const promptId = str(a["prompt.id"]);

        await touchSession(sid, { source: "otel", orgId, email, surface, at: ts });
        if (email) {
          await sql`insert into people (org_id, email, account_id) values (${orgId}, ${email}, ${str(a["user.account_id"])})
                    on conflict (org_id, email) do update set last_seen = now()`;
        }

        switch (event) {
          case "user_prompt": {
            if (promptId) {
              const text = str(a["prompt"]) ?? str(a["prompt_text"]);
              await upsertPrompt({ id: promptId, sessionId: sid, ts, text: text?.slice(0, 20_000) ?? null, length: num(a["prompt_length"]) });
            }
            await live(orgId, sid, "otel", "user_prompt", email ?? undefined);
            break;
          }
          case "tool_result": {
            const tool = str(a["tool_name"]) ?? "unknown";
            let params: Record<string, unknown> = {};
            try { params = JSON.parse(String(a["tool_parameters"] ?? "{}")); } catch {}
            const d = describeTool(tool, a["tool_input"] ?? params);
            if (!d.mcpServer && typeof params.mcp_server_name === "string") {
              Object.assign(d, { mcpServer: params.mcp_server_name, mcpTool: params.mcp_tool_name ?? null });
            }
            const toolUse = str(a["tool_use_id"]);
            await insertTool({
              dedupKey: toolUse ? `tool:${toolUse}` : `otel:${sid}:${seq ?? `${promptId}:${tool}:${ts.getTime()}`}`,
              sessionId: sid, promptId, ts, source: "otel", toolName: tool,
              invocation: tool === "Skill" ? "model" : null, success: String(a["success"]) !== "false", ...d,
            });
            await live(orgId, sid, "otel", "tool_result", [tool, d.skillRaw, d.mcpServer, d.fileExt && `.${d.fileExt}`].filter(Boolean).join(" · "));
            break;
          }
          case "skill_activated": {
            const skill = str(a["skill.name"]);
            if (skill) {
              await insertTool({
                dedupKey: `otel:${sid}:${seq ?? `${promptId}:skill:${skill}`}`, sessionId: sid, promptId, ts, source: "otel",
                toolName: "Skill", skillRaw: skill, invocation: str(a["invocation_trigger"]) === "user" ? "user-slash" : "model",
              });
            }
            break;
          }
          case "api_request": {
            const key = `${sid}:${seq ?? str(a["request_id"]) ?? ts.getTime()}`;
            const inT = num(a["input_tokens"]) ?? 0, outT = num(a["output_tokens"]) ?? 0;
            const cache = (num(a["cache_read_tokens"]) ?? 0) + (num(a["cache_creation_tokens"]) ?? 0);
            const cost = num(a["cost_usd"]) ?? 0;
            const inserted = await sql`
              insert into api_requests (dedup_key, session_id, ts, model, input_tokens, output_tokens, cache_tokens, cost_usd)
              values (${key}, ${sid}, ${ts}, ${str(a["model"])}, ${inT}, ${outT}, ${cache}, ${cost})
              on conflict do nothing returning 1`;
            if (inserted.length) {
              await sql`update sessions set input_tokens = input_tokens + ${inT}, output_tokens = output_tokens + ${outT},
                          cache_tokens = cache_tokens + ${cache}, cost_usd = cost_usd + ${cost},
                          model = coalesce(${str(a["model"])}, model) where id = ${sid}`;
            }
            break;
          }
          default:
            // assistant_response, tool_decision, api_error, hook_*, etc.: identity only; content is never stored.
            break;
        }
      }
    }
  }
  return records;
}
