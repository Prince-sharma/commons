// Minimal Sarvam chat client (OpenAI-compatible /chat/completions).
// Docs: https://docs.sarvam.ai/api-reference/chat/chat-completions-v2
// Default model: DeepSeek V4.1 Flash on the v2 route (beta; the key must be whitelisted). Reasoning is kept low:
// labels are short, and reasoning tokens count against max_tokens, so reasoning models get extra headroom.

const BASE = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai/v2";
const MODEL = process.env.SARVAM_MODEL ?? "deepseekv4.1-flash";
const REASONING = /deepseek|glm/i.test(MODEL);
const REASONING_HEADROOM = 2000;

type Message = { role: "system" | "user" | "assistant"; content: string };

async function call(body: Record<string, unknown>): Promise<string> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0, reasoning_effort: REASONING ? "low" : null, ...body,
        max_tokens: (body.max_tokens as number) + (REASONING ? REASONING_HEADROOM : 0),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Sarvam ${res.status}: ${await res.text()}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Sarvam ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("Sarvam response hit max_tokens");
    return choice?.message?.content ?? "";
  }
  throw lastErr;
}

export async function sarvamJson<T>(messages: Message[], name: string, schema: object, maxTokens = 400): Promise<T> {
  const content = await call({
    messages,
    max_tokens: maxTokens,
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
  });
  return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
}

export async function sarvamText(messages: Message[], maxTokens = 2000): Promise<string> {
  return (await call({ messages, max_tokens: maxTokens })).trim();
}
