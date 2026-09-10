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
  /** Cap on the visible answer. Thinking is disabled, so this is not spent on reasoning. */
  maxTokens: number;
  /**
   * Only sent to the API when set. `claude-sonnet-5` deprecates `temperature`
   * (400 on any value), so callers that want determinism just omit it and rely
   * on the model's own low-variance default plus, for the judge, retry-median.
   */
  temperature?: number;
}

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
 * Thinking is explicitly disabled: `claude-sonnet-5` runs extended thinking by
 * default and, for a structured-extraction or judging prompt, will otherwise
 * spend the whole `max_tokens` budget on a thinking block and return no text
 * (`stop_reason: max_tokens`, content `[{type:"thinking"}]`). These tasks want
 * the answer, not the reasoning.
 */
async function once(args: CompleteArgs): Promise<string> {
  const res = await getClient().messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    thinking: { type: "disabled" },
    ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
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
