import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ajv2020Module from "ajv/dist/2020.js";

// ajv/dist/2020 is CJS; under NodeNext + verbatimModuleSyntax the constructable
// value is on `.default` (matches packages/skills/src/registry.ts).
const Ajv2020 = ((ajv2020Module as unknown as { default?: unknown }).default ??
  ajv2020Module) as unknown as typeof import("ajv/dist/2020.js").default;

export interface BriefCitation {
  path: string;
  /** The verbatim supporting text the model returns; the skill computes `span` from it. */
  quote: string;
  span: [number, number];
}

export interface BriefItem {
  text: string;
  citation: BriefCitation;
}

export interface BriefOutput {
  goal: string;
  what_we_know: BriefItem[];
  talking_points: BriefItem[];
  risks: BriefItem[];
  citations: BriefCitation[];
  unsourced_claims: string[];
}

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate repo root from brief-schema.ts");
}

const SCHEMA_PATH = join(repoRoot(), "context/schema/brief-output.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a candidate call-prep return against
 * `context/schema/brief-output.json`. Compiled in-package — deliberately NOT
 * via context-core's `SCHEMA_TYPES` registry (mirrors summary-schema.ts /
 * spec 002 OQ5 precedent: this slice does not touch context-core). `loadSchemas`
 * still auto-discovers the file, so a later slice can move to the registry
 * route without a schema change.
 */
export function validateBriefOutput(value: unknown): ValidationResult {
  const ok = validate(value) as boolean;
  const errors = ok
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());
  return { valid: ok, errors };
}
