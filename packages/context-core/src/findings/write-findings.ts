import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertAppendOnly } from "../fs/append-only.js";
import { validateAgainst } from "../schema/validate.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { sha256 } from "../quarantine/hash.js";
import { AppendOnlyViolationError, SchemaValidationError } from "../errors.js";
import { SCHEMA_VERSION } from "../schema/registry.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import type { Actor, Finding, WriteFindingsArgs } from "../types.js";

export interface WriteFindingsDeps {
  root: string;
  registry: SchemaRegistry;
  now?: () => Date;
}

export interface WriteFindingsResult {
  artifactPath: string;
}

/**
 * Persist a review skill's `Finding[]` as a new `kind: findings` artifact under
 * the opportunity. This is the "separate step" after `sow-review` returns
 * findings — review skills have no write grant, so this is called by the runner,
 * never by the skill.
 *
 * - Each finding is validated against `finding.json`.
 * - The target must be under `context/accounts/<slug>/opportunities/<crmId>/artifacts/`.
 *   A `context/legal/**` target (or any non-artifact target) is rejected.
 * - Always a NEW file: an existing artifact is never overwritten (append-only).
 */
export async function writeFindings(
  args: WriteFindingsArgs,
  deps: WriteFindingsDeps,
): Promise<WriteFindingsResult> {
  const now = deps.now ? deps.now() : new Date();

  for (const [i, finding] of args.findings.entries()) {
    const res = validateAgainst(deps.registry, "finding", finding);
    if (!res.valid) {
      throw new SchemaValidationError(`findings[${i}]`, "finding", res.issues);
    }
  }

  const oppDir = `context/accounts/${args.accountSlug}/opportunities/${args.crmId}`;
  const artifactsDir = `${oppDir}/artifacts`;
  const baseId = `f-${now.toISOString().slice(0, 10)}-${shortId(now)}`;
  const sourceHash = await hashSourceDocument(deps.root, args.sourceDocument);

  // Same collision guard as writeArtifact: `flag: "wx"` plus a bounded
  // re-mint on EEXIST. The default id is clock-derived, so same-tick calls
  // share a base and get `-2`, `-3`, ... suffixes from mintFindingsId.
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const artifactId = args.artifactId ?? (await mintFindingsId(deps.root, artifactsDir, baseId));
    const relPath = `${artifactsDir}/${artifactId}-findings.md`;

    if (!relPath.includes("/artifacts/") || relPath.includes("context/legal/")) {
      throw new AppendOnlyViolationError(
        relPath,
        "create",
        "findings must be written under artifacts/",
      );
    }
    // Runs the append-only check (create is allowed; this also rejects bad shapes).
    assertAppendOnly(relPath, "create");

    const absPath = resolveContextPath(relPath, deps.root);
    const content = renderFindingsArtifact({
      artifactId,
      created: now.toISOString(),
      sourceDocument: args.sourceDocument,
      sourceHash,
      findings: args.findings,
      actor: args.actor,
    });

    try {
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, { encoding: "utf8", flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        if (args.artifactId) {
          throw new AppendOnlyViolationError(
            relPath,
            "create",
            "a findings artifact already exists at this path",
          );
        }
        lastErr = e;
        continue; // re-list, re-mint, re-attempt
      }
      throw e;
    }

    return { artifactPath: relPath };
  }
  throw new AppendOnlyViolationError(
    artifactsDir,
    "create",
    `could not mint a collision-free findings id after ${MAX_MINT_ATTEMPTS} attempts: ${(lastErr as Error)?.message ?? "unknown"}`,
  );
}

const MAX_MINT_ATTEMPTS = 8;

function shortId(now: Date): string {
  return now.getTime().toString(36).slice(-6);
}

/** `base` if unused in artifacts/, else `base-<n>` with n one past the highest taken (bare base = 1). */
async function mintFindingsId(
  root: string,
  artifactsDirLogical: string,
  base: string,
): Promise<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(resolveContextPath(artifactsDirLogical, root));
  } catch {
    entries = []; // directory doesn't exist yet — first artifact
  }
  const re = new RegExp(
    `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-(\\d+))?-findings\\.md$`,
  );
  let max = 0;
  for (const e of entries) {
    const m = re.exec(e);
    if (m) max = Math.max(max, m[1] ? parseInt(m[1], 10) : 1);
  }
  return max === 0 ? base : `${base}-${max + 1}`;
}

async function hashSourceDocument(root: string, sourceDocument: string): Promise<string> {
  const abs = resolveContextPath(sourceDocument, root);
  const text = await readFile(abs, "utf8");
  // hash the body (post-frontmatter), matching inbound source_hash semantics
  const idx = text.indexOf("\n---");
  const afterFm = idx >= 0 ? text.slice(text.indexOf("\n", idx + 4) + 1) : text;
  return sha256(afterFm);
}

interface RenderArgs {
  artifactId: string;
  created: string;
  sourceDocument: string;
  sourceHash: string;
  findings: Finding[];
  actor: Actor;
}

function renderFindingsArtifact(a: RenderArgs): string {
  const blockerCount = a.findings.filter((f) => f.severity === "blocker").length;
  const fm = [
    "---",
    "fictional: true",
    "mutability: accumulating",
    `schema_version: "${SCHEMA_VERSION}"`,
    `created: "${a.created}"`,
    `title: "Review findings — ${a.artifactId}"`,
    `artifact_id: ${a.artifactId}`,
    "kind: findings",
    "generated_by: sow-review",
    "superseded: false",
    `actor: {type: ${a.actor.type}, id: "${a.actor.id.replaceAll('"', '\\"')}"}`,
    "citations: []",
    `source_document: ${a.sourceDocument}`,
    `source_hash: "${a.sourceHash}"`,
    "---",
    "",
  ].join("\n");

  const body = [
    `# Review findings`,
    "",
    `Reviewed: \`${a.sourceDocument}\``,
    `Findings: ${a.findings.length} (${blockerCount} blocker${blockerCount === 1 ? "" : "s"})`,
    "",
    "> Risk flags for a human reviewer. Not legal advice.",
    "",
    "```json",
    JSON.stringify(a.findings, null, 2),
    "```",
    "",
  ].join("\n");

  return fm + body;
}
