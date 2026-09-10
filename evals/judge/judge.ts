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

/** Pull the first flat `{...}` object from a judge response and read the four scores. */
function parseScores(text: string): RubricScores | null {
  const m = text.match(/\{[^}]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out = {} as RubricScores;
  for (const k of DIMENSIONS) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 5) return null;
    out[k] = v;
  }
  return out;
}

interface JudgeConfig {
  model: string;
  temperature: number;
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

/**
 * Score a call-summary output against the committed rubric with the committed
 * judge model. Runs `attempts` completions, takes the median per dimension, then
 * aggregates. The rubric gate (aggregate >= 4.0) is applied by the caller; a
 * hard-fail below 4.0 is not softened (spec 002 OQ2). Throws only if no attempt
 * produced parseable scores.
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
  for (let i = 0; i < attempts; i++) {
    const text = await complete({
      system: "You are a strict evaluation judge. Output only the requested JSON.",
      user,
      model: c.model,
      maxTokens: c.max_tokens,
      temperature: c.temperature,
    });
    const s = parseScores(text);
    if (s) got.push(s);
  }
  if (got.length === 0) {
    throw new Error("rubric judge returned no parseable scores across all attempts");
  }

  const merged: RubricScores = {
    grounding: median(got.map((g) => g.grounding)),
    completeness: median(got.map((g) => g.completeness)),
    tone: median(got.map((g) => g.tone)),
    structure: median(got.map((g) => g.structure)),
  };
  return { ...merged, aggregate: aggregate(merged), attempts: got };
}
