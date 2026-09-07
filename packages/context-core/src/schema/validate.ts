import type { ErrorObject } from "ajv";
import type { SchemaRegistry } from "./registry.js";

export interface ValidationResult {
  valid: boolean;
  /** Human-readable issue strings, empty when `valid`. */
  issues: string[];
}

function formatError(err: ErrorObject): string {
  const at = err.instancePath === "" ? "(root)" : err.instancePath;
  if (err.keyword === "additionalProperties" || err.keyword === "unevaluatedProperties") {
    const prop = (err.params as { additionalProperty?: string; unevaluatedProperty?: string })
      .additionalProperty;
    const unev = (err.params as { unevaluatedProperty?: string }).unevaluatedProperty;
    return `${at}: unexpected property "${prop ?? unev}"`;
  }
  return `${at}: ${err.message ?? "invalid"}`;
}

/**
 * Validate a parsed frontmatter object (or a skill-output value) against the
 * named schema type in the registry.
 */
export function validateAgainst(
  registry: SchemaRegistry,
  schemaType: string,
  data: unknown,
): ValidationResult {
  const validate = registry.get(schemaType);
  const valid = validate(data) as boolean;
  if (valid) {
    return { valid: true, issues: [] };
  }
  const issues = (validate.errors ?? []).map(formatError);
  return { valid: false, issues: issues.length > 0 ? issues : ["unknown validation failure"] };
}
