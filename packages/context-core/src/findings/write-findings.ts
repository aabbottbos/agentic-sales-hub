import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertAppendOnly } from "../fs/append-only.js";
import { validateAgainst } from "../schema/validate.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { sha256 } from "../quarantine/hash.js";
import { AppendOnlyViolationError, SchemaValidationError } from "../errors.js";
import { SCHEMA_VERSION } from "../schema/registry.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import type { Finding, WriteFindingsArgs } from "../types.js";

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

  const artifactId = args.artifactId ?? `f-${now.toISOString().slice(0, 10)}-${shortId(now)}`;
  const oppDir = `context/accounts/${args.accountSlug}/opportunities/${args.crmId}`;
  const relPath = `${oppDir}/artifacts/${artifactId}-findings.md`;

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
  await assertDoesNotExist(absPath, relPath);

  const sourceHash = await hashSourceDocument(deps.root, args.sourceDocument);
  const content = renderFindingsArtifact({
    artifactId,
    created: now.toISOString(),
    sourceDocument: args.sourceDocument,
    sourceHash,
    findings: args.findings,
  });

  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, { encoding: "utf8", flag: "wx" });

  return { artifactPath: relPath };
}

function shortId(now: Date): string {
  return now.getTime().toString(36).slice(-6);
}

async function assertDoesNotExist(absPath: string, relPath: string): Promise<void> {
  try {
    await readFile(absPath, "utf8");
  } catch {
    return; // does not exist — good
  }
  throw new AppendOnlyViolationError(
    relPath,
    "create",
    "a findings artifact already exists at this path",
  );
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
