import Anthropic from "@anthropic-ai/sdk";

/**
 * The single seam between our skills and a foundation-model API. Model
 * portability across vendors is an explicit v1 non-goal (spec 002 OQ1) — keep
 * this narrow: one function, one place to audit, stub, or rate-limit.
 */
export interface CompleteArgs {
  system: string;
  user: string;
  model: string;
  /** Cap on the visible answer. Thinking is off, so this is not spent on reasoning. */
  maxTokens: number;
  /**
   * Only sent to the API when set. `claude-sonnet-5` deprecates `temperature`
   * (400 on any value), so callers that want determinism just omit it and rely
   * on the model's own low-variance default plus, for the judge, retry-median.
   */
  temperature?: number;
}

/** Models that take `thinking: {type: "between_tools"}` instead of `disabled` (plan 008). */
const BETWEEN_TOOLS_MODELS = new Set(["claude-sonnet-5-5"]);

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — call-summary and the rubric judge need it. " +
        "In CI it is a GitHub Actions secret; locally, export it before running.",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * One non-streaming completion. Returns the concatenated text of the response.
 *
 * Thinking is explicitly off: these models run extended thinking by default
 * and, for a structured-extraction or judging prompt, will otherwise spend the
 * whole `max_tokens` budget on a thinking block and return no text
 * (`stop_reason: max_tokens`, content `[{type:"thinking"}]`). These tasks want
 * the answer, not the reasoning.
 *
 * `claude-sonnet-5` turns it off with `disabled`. `claude-sonnet-5-5` rejects
 * `disabled` (400) and takes `between_tools`, which is valid only at effort
 * `high` or below and only on that model — so effort is pinned to `high`
 * (levels were recalibrated from Sonnet 5; set explicitly, not defaulted). The
 * Sonnet 5.5 path also opts into server-side refusal fallback, which retries
 * `cyber`/`frontier_llm` declines on Sonnet 5.
 */
async function once(args: CompleteArgs): Promise<string> {
  const base = {
    model: args.model,
    max_tokens: args.maxTokens,
    ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
    system: args.system,
    messages: [{ role: "user" as const, content: args.user }],
  };
  const res = BETWEEN_TOOLS_MODELS.has(args.model)
    ? await getClient().beta.messages.create({
        ...base,
        // SDK 0.124 doesn't type `between_tools` yet; the API accepts it.
        thinking: { type: "between_tools" } as unknown as Anthropic.Beta.BetaThinkingConfigParam,
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
    : await getClient().messages.create({ ...base, thinking: { type: "disabled" } });

  if (res.stop_reason === "refusal") {
    const category = res.stop_details?.category ?? "unspecified";
    throw new Error(`${args.model} declined the request (refusal category: ${category})`);
  }
  if (res.model && res.model !== args.model) {
    console.warn(`[llm] ${args.model} request was served by ${res.model} (refusal fallback)`);
  }
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** True for errors worth retrying — rate limits, timeouts, 5xx. Not 4xx. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const name = (err as { name?: string }).name ?? "";
  return /Connection|Timeout/i.test(name);
}

/**
 * One non-streaming completion. Returns the concatenated text of the response.
 * Retries up to `retries` times on a transient error (429 / 5xx / connection),
 * with a short backoff. A 4xx (bad request, auth, credits) fails immediately.
 */
export async function complete(args: CompleteArgs, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await once(args);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Test seam: swap the client (or pass null to reset). */
export function _setClientForTest(c: unknown): void {
  client = c as Anthropic | null;
}
