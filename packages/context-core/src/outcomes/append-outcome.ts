import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateAgainst } from "../schema/validate.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { SchemaValidationError } from "../errors.js";
import type { AppendOutcomeArgs } from "../types.js";

export interface AppendOutcomeDeps {
  repoRoot: string;
  registry: SchemaRegistry;
}

/**
 * Append one outcome record to an opportunity's `outcomes.jsonl`. Append-only by
 * construction — this never rewrites existing lines. The record is validated
 * against `outcome.json` first.
 */
export async function appendOutcome(
  args: AppendOutcomeArgs,
  deps: AppendOutcomeDeps,
): Promise<{ outcomesPath: string }> {
  const record = {
    date: args.date,
    artifact: args.artifact,
    outcome: args.outcome,
    ...(args.note !== undefined ? { note: args.note } : {}),
  };

  const res = validateAgainst(deps.registry, "outcome", record);
  if (!res.valid) {
    throw new SchemaValidationError("outcomes.jsonl (new line)", "outcome", res.issues);
  }

  const relPath = `context/accounts/${args.accountSlug}/opportunities/${args.crmId}/outcomes.jsonl`;
  const absPath = join(deps.repoRoot, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await appendFile(absPath, JSON.stringify(record) + "\n", "utf8");
  return { outcomesPath: relPath };
}
