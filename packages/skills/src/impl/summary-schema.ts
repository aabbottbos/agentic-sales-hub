import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ajv2020Module from "ajv/dist/2020.js";

// ajv/dist/2020 is CJS; under NodeNext + verbatimModuleSyntax the constructable
// value is on `.default` (matches packages/skills/src/registry.ts).
const Ajv2020 = ((ajv2020Module as unknown as { default?: unknown }).default ??
  ajv2020Module) as unknown as typeof import("ajv/dist/2020.js").default;

export interface Citation {
  path: string;
  /** The verbatim supporting text the model returns; the skill computes `span` from it. */
  quote: string;
  span: [number, number];
}

export interface SummaryItem {
  text: string;
  owner: "us" | "counterparty" | "unknown";
  citation: Citation;
}

export type DeltaField =
  | "stage"
  | "close_date"
  | "amount"
  | "champion"
  | "risk"
  | "competitor"
  | "next_meeting"
  | "other";

export interface ContextDelta {
  field: DeltaField;
  observation: string;
  citation: Citation;
}

export interface SummaryOutput {
  summary: string;
  commitments: SummaryItem[];
  next_steps: SummaryItem[];
  context_deltas: ContextDelta[];
  citations: Citation[];
  unsourced_claims: string[];
}

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate repo root from summary-schema.ts");
}

const SCHEMA_PATH = join(repoRoot(), "context/schema/summary-output.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a candidate call-summary return against
 * `context/schema/summary-output.json`. Compiled in-package — deliberately NOT
 * via context-core's `SCHEMA_TYPES` registry (spec 002 OQ5: this slice does not
 * touch context-core). `loadSchemas` still auto-discovers the file, so a later
 * slice can move to the registry route without a schema change.
 */
export function validateSummaryOutput(value: unknown): ValidationResult {
  const ok = validate(value) as boolean;
  const errors = ok
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());
  return { valid: ok, errors };
}
