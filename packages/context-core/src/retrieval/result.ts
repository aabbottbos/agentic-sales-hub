import type { SchemaRegistry } from "../schema/registry.js";
import { validateAgainst } from "../schema/validate.js";
import type { RetrievalResult } from "../types.js";

/**
 * Validate a retrieval skill's output against `retrieval-result.json`. Throws
 * with the collected issues if it does not conform to the output contract.
 */
export function assertValidRetrievalResult(
  registry: SchemaRegistry,
  result: RetrievalResult,
): void {
  const res = validateAgainst(registry, "retrieval-result", result);
  if (!res.valid) {
    throw new Error(
      `retrieval result does not satisfy its output contract:\n  ${res.issues.join("\n  ")}`,
    );
  }
}
