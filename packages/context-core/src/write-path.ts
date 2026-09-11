import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { assertAppendOnly } from "./fs/append-only.js";
import { validateAgainst } from "./schema/validate.js";
import type { SchemaRegistry } from "./schema/registry.js";
import { AppendOnlyViolationError, SchemaValidationError } from "./errors.js";
import { SCHEMA_VERSION } from "./schema/registry.js";
import { resolveContextPath } from "./fs/resolve-path.js";
import { appendOutcome } from "./outcomes/append-outcome.js";
import type { WriteArtifactArgs, WriteArtifactResult } from "./types.js";

export interface WriteArtifactDeps {
  root: string;
  registry: SchemaRegistry;
  now?: () => Date;
}

const MAX_MINT_ATTEMPTS = 8;

/**
 * Persist a generation skill's structured output as a new `kind: <kind>`
 * artifact under the opportunity. The ONLY sanctioned way to create a file
 * under `context/accounts/*\/opportunities/*\/artifacts/**` — runSkill calls
 * this after validating a generation-tier skill's output; the skill impl
 * never writes (spec 004 JC7).
 *
 * - Mints a sequential `a-000N` id by listing artifacts/ (JC8); the actual
 *   collision guard is `flag: "wx"` plus a bounded retry on EEXIST, not the
 *   id scheme being unguessable.
 * - Validates the rendered frontmatter against artifact.json before writing.
 * - Checks for an org output template (context/org/templates/<kind>.md); a
 *   no-op returning {valid:true} when absent — enforcement logic beyond
 *   presence-check is WI-5 (spec 004 OQ5).
 * - Auto-opens an `unused` outcome record via appendOutcome() on success.
 */
export async function writeArtifact(
  args: WriteArtifactArgs,
  deps: WriteArtifactDeps,
): Promise<WriteArtifactResult> {
  const now = deps.now ? deps.now() : new Date();
  const oppDir = `context/accounts/${args.accountSlug}/opportunities/${args.crmId}`;
  const artifactsDir = `${oppDir}/artifacts`;

  const templateCheck = checkOutputTemplate(deps.root, args.kind);
  if (!templateCheck.valid) {
    throw new SchemaValidationError(
      `${artifactsDir}/<new>`,
      "output-template",
      templateCheck.errors,
    );
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const artifactId = args.artifactId ?? (await mintNextId(deps.root, artifactsDir));
    const relPath = `${artifactsDir}/${artifactId}-${args.kind}.md`;

    const frontmatter = buildFrontmatter({ ...args, artifactId, created: now.toISOString() });
    const res = validateAgainst(deps.registry, "artifact", frontmatter);
    if (!res.valid) throw new SchemaValidationError(relPath, "artifact", res.issues);

    assertAppendOnly(relPath, "create");
    const absPath = resolveContextPath(relPath, deps.root);
    const content = renderArtifact({ ...args, artifactId, created: now.toISOString() });

    try {
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, { encoding: "utf8", flag: "wx" });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        if (args.artifactId) {
          throw new AppendOnlyViolationError(
            relPath,
            "create",
            "an artifact already exists at this explicit artifact id",
          );
        }
        lastErr = e;
        continue; // re-list, re-mint, re-attempt
      }
      throw e;
    }

    await appendOutcome(
      {
        accountSlug: args.accountSlug,
        crmId: args.crmId,
        artifact: relPath,
        outcome: "unused",
        date: now.toISOString().slice(0, 10),
      },
      { root: deps.root, registry: deps.registry },
    );

    return { artifactPath: relPath, artifactId };
  }
  throw new AppendOnlyViolationError(
    artifactsDir,
    "create",
    `could not mint a collision-free artifact id after ${MAX_MINT_ATTEMPTS} attempts: ${(lastErr as Error)?.message ?? "unknown"}`,
  );
}

/** List artifacts/ and return the next sequential a-000N id (4-digit, zero-padded). */
async function mintNextId(root: string, artifactsDirLogical: string): Promise<string> {
  const absDir = resolveContextPath(artifactsDirLogical, root);
  let entries: string[] = [];
  try {
    entries = await readdir(absDir);
  } catch {
    entries = []; // directory doesn't exist yet — first artifact
  }
  let max = 0;
  for (const e of entries) {
    const m = /^a-(\d{4,})-/.exec(e);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `a-${String(max + 1).padStart(4, "0")}`;
}

/** Presence-check only. Returns {valid:true} unconditionally when no template
 *  file exists. Enforcement logic (parsing required sections out of the
 *  template, checking the rendered body against them) is WI-5. */
function checkOutputTemplate(root: string, kind: string): { valid: boolean; errors: string[] } {
  const templatePath = resolveContextPath(`context/org/templates/${kind}.md`, root);
  if (!existsSync(templatePath)) return { valid: true, errors: [] };
  return { valid: true, errors: [] }; // template exists but is not yet enforced — WI-5
}

interface RenderArgs extends WriteArtifactArgs {
  artifactId: string;
  created: string;
}

function buildFrontmatter(a: RenderArgs): Record<string, unknown> {
  return {
    fictional: true,
    mutability: "accumulating",
    schema_version: SCHEMA_VERSION,
    created: a.created,
    title: a.title,
    artifact_id: a.artifactId,
    kind: a.kind,
    generated_by: a.generatedBy,
    superseded: false,
    citations: a.citations.map((c) => ({ claim: c.claim, path: c.path, span: c.span })),
    ...(a.unsourcedClaims?.length ? { unsourced_claims: a.unsourcedClaims } : {}),
  };
}

function renderArtifact(a: RenderArgs): string {
  const fm = buildFrontmatter(a);
  const lines = [
    "---",
    `fictional: ${fm.fictional}`,
    `mutability: ${fm.mutability}`,
    `schema_version: "${fm.schema_version}"`,
    `created: "${fm.created}"`,
    `title: "${(fm.title as string).replaceAll('"', '\\"')}"`,
    `artifact_id: ${fm.artifact_id}`,
    `kind: ${fm.kind}`,
    `generated_by: ${fm.generated_by}`,
    `superseded: false`,
    "citations:",
    ...a.citations.map(
      (c) =>
        `  - claim: ${JSON.stringify(c.claim)}\n    path: ${c.path}\n    span: [${c.span[0]}, ${c.span[1]}]`,
    ),
    ...(a.unsourcedClaims?.length
      ? ["unsourced_claims:", ...a.unsourcedClaims.map((s) => `  - ${JSON.stringify(s)}`)]
      : []),
    "---",
    "",
  ];
  return lines.join("\n") + a.body;
}
