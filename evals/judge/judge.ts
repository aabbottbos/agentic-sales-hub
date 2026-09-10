import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { complete } from "../../packages/skills/src/impl/llm.js";
import type { SummaryOutput } from "../../packages/skills/src/impl/summary-schema.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface RubricScores {
  grounding: number;
  completeness: number;
  tone: number;
  structure: number;
}

export interface RubricResult extends RubricScores {
  /** mean of the four dimension medians, rounded to 2dp */
  aggregate: number;
  /** the per-attempt scores that parsed (unparseable attempts are dropped) */
  attempts: RubricScores[];
  /** set when the judge produced no usable scores; dims + aggregate are 0 */
  unavailable?: boolean;
}

const DIMENSIONS = ["grounding", "completeness", "tone", "structure"] as const;

export function aggregate(s: RubricScores): number {
  const mean = (s.grounding + s.completeness + s.tone + s.structure) / 4;
  return Math.round(mean * 100) / 100;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) throw new Error("median of empty array");
  const m = Math.floor(s.length / 2);
  if (s.length % 2) return s[m] as number;
  return ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Read the four scores from a judge response. Tries each `{...}` object in the
 * text (last first — the judge may write prose with braces before the answer)
 * and returns the first that carries all four dimensions as 1-5 numbers.
 */
function parseScores(text: string): RubricScores | null {
  const candidates = text.match(/\{[^{}]*\}/g);
  if (!candidates) return null;
  for (const raw of candidates.reverse()) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const out = {} as RubricScores;
    let ok = true;
    for (const k of DIMENSIONS) {
      const v = o[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 5) {
        ok = false;
        break;
      }
      out[k] = v;
    }
    if (ok) return out;
  }
  return null;
}

interface JudgeConfig {
  model: string;
  max_tokens: number;
  attempts: number;
}

let cfg: JudgeConfig | null = null;
function loadConfig(): JudgeConfig {
  if (cfg) return cfg;
  cfg = JSON.parse(readFileSync(join(here, "judge-model.json"), "utf8")) as JudgeConfig;
  return cfg;
}

const rubricText = readFileSync(join(here, "rubric.md"), "utf8");
const promptTemplate = readFileSync(join(here, "judge-prompt.md"), "utf8");

const ZERO: RubricScores = { grounding: 0, completeness: 0, tone: 0, structure: 0 };

/**
 * Score a call-summary output against the committed rubric with the committed
 * judge model. Runs `attempts` completions, takes the median per dimension, then
 * aggregates.
 *
 * `rubric_aggregate` is an ADVISORY metric, not a blocking gate (spec 002 OQ2
 * amendment; see evals/judge/README.md). So a flaky judge must not fail the
 * suite: individual empty/unparseable responses are retried within the loop, and
 * if every attempt fails this returns `{ ...ZERO, aggregate: 0, unavailable:
 * true }` rather than throwing. The deterministic gates still decide the build.
 */
export async function scoreRubric(
  output: SummaryOutput,
  noteText: string,
  opts?: { attempts?: number },
): Promise<RubricResult> {
  const c = loadConfig();
  const attempts = opts?.attempts ?? c.attempts;
  const user = promptTemplate
    .replace("{{RUBRIC}}", rubricText)
    .replace("{{NOTE}}", noteText)
    .replace("{{OUTPUT}}", JSON.stringify(output, null, 2));

  const got: RubricScores[] = [];
  // Allow a few extra tries so a transient empty response does not starve the
  // median, but cap total calls.
  const maxCalls = attempts + 2;
  for (let i = 0; i < maxCalls && got.length < attempts; i++) {
    let text = "";
    try {
      text = await complete({
        system: "You are a strict evaluation judge. Output only the requested JSON.",
        user,
        model: c.model,
        maxTokens: c.max_tokens,
      });
    } catch {
      continue;
    }
    const s = parseScores(text);
    if (s) got.push(s);
  }

  if (got.length === 0) {
    return { ...ZERO, aggregate: 0, attempts: [], unavailable: true };
  }

  const merged: RubricScores = {
    grounding: median(got.map((g) => g.grounding)),
    completeness: median(got.map((g) => g.completeness)),
    tone: median(got.map((g) => g.tone)),
    structure: median(got.map((g) => g.structure)),
  };
  return { ...merged, aggregate: aggregate(merged), attempts: got };
}
