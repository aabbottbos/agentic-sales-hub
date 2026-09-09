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
  maxTokens: number;
  /** Default 0. Surfaced for callers that want it; the eval judge pins 0. */
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

/** One non-streaming completion. Returns the concatenated text of the response. */
export async function complete(args: CompleteArgs): Promise<string> {
  const res = await getClient().messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: args.temperature ?? 0,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Test seam: swap the client (or pass null to reset). */
export function _setClientForTest(c: unknown): void {
  client = c as Anthropic | null;
}
