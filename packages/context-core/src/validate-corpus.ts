import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLoader } from "./loader.js";
import { classify } from "./frontmatter/classify.js";
import { parseFrontmatter } from "./frontmatter/parse.js";
import { validateAgainst } from "./schema/validate.js";
import { DealDeskError } from "./errors.js";

export interface CorpusValidationReport {
  filesChecked: number;
  errors: Array<{ path: string; message: string }>;
}

const OPP_DIR_RE = /^context\/accounts\/([^/]+)\/opportunities\/([^/]+)\//;
const ACCOUNT_DIR_RE = /^context\/accounts\/([^/]+)\//;

function matchDir(re: RegExp, path: string): RegExpMatchArray | null {
  return path.match(re);
}

/**
 * Validate every file under `<repoRoot>/context/`:
 * - each classifiable file parses, validates against its schema, and (for
 *   inbound) matches its `source_hash`;
 * - each `.md` under `context/` that does NOT classify is an error;
 * - `opportunity.md` `crm_id` equals its directory name;
 * - `account.md` `account_slug` equals its directory name;
 * - every line of every `outcomes.jsonl` validates against `outcome`.
 */
export async function validateCorpus(repoRoot: string): Promise<CorpusValidationReport> {
  const loader = await createLoader({ repoRoot });
  const files = await loader.list();
  const errors: CorpusValidationReport["errors"] = [];
  let filesChecked = 0;

  for (const rel of files) {
    filesChecked++;
    try {
      if (rel.endsWith("outcomes.jsonl")) {
        await checkOutcomes(repoRoot, rel, loader.registry);
        continue;
      }

      const cls = classify(rel);
      if (!cls) {
        errors.push({ path: rel, message: "file does not match any known context-file location" });
        continue;
      }

      // Full read: parse + classify + schema-validate + inbound source_hash.
      await loader.read(rel);

      // Directory-name cross-checks.
      const raw = await readFile(join(repoRoot, rel), "utf8");
      const fm = parseFrontmatter(raw).data;

      if (cls.schemaType === "opportunity") {
        const m = matchDir(OPP_DIR_RE, rel);
        if (m && fm.crm_id !== m[2]) {
          errors.push({
            path: rel,
            message: `crm_id "${String(fm.crm_id)}" does not match directory name "${m[2]}"`,
          });
        }
      }
      if (cls.schemaType === "account") {
        const m = matchDir(ACCOUNT_DIR_RE, rel);
        if (m && fm.account_slug !== m[1]) {
          errors.push({
            path: rel,
            message: `account_slug "${String(fm.account_slug)}" does not match directory name "${m[1]}"`,
          });
        }
      }
    } catch (e) {
      const message = e instanceof DealDeskError ? e.message : (e as Error).message;
      errors.push({ path: rel, message });
    }
  }

  return { filesChecked, errors };
}

async function checkOutcomes(
  repoRoot: string,
  rel: string,
  registry: Awaited<ReturnType<typeof createLoader>>["registry"],
): Promise<void> {
  const text = await readFile(join(repoRoot, rel), "utf8");
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error(`${rel}:${i + 1} is not valid JSON`);
    }
    const res = validateAgainst(registry, "outcome", obj);
    if (!res.valid) {
      throw new Error(`${rel}:${i + 1} invalid outcome: ${res.issues.join("; ")}`);
    }
  }
}
