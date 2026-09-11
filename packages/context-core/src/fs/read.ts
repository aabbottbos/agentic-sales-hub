import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { classify } from "../frontmatter/classify.js";
import { parseFrontmatter } from "../frontmatter/parse.js";
import { validateAgainst } from "../schema/validate.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { isSchemaVersionAccepted } from "../schema/registry.js";
import { sha256 } from "../quarantine/hash.js";
import { SchemaValidationError, SourceHashMismatchError, UnreadableError } from "../errors.js";
import { resolveContextPath } from "./resolve-path.js";
import type { ContextFile } from "../types.js";

export interface ReadContextFileOptions {
  root: string;
  registry: SchemaRegistry;
}

/** Convert an absolute or root-relative path to a normalized root-relative posix path. */
export function toRepoRelative(root: string, p: string): string {
  const rel = isAbsolute(p) ? relative(root, p) : p;
  return rel.replaceAll("\\", "/");
}

/**
 * Read, parse, classify, and schema-validate a single context file.
 *
 * For `inbound/**` files this also verifies `source_hash` against the body. It
 * does NOT perform quarantine wrapping or taint registration — those happen in
 * `readInbound` on the loader, which is the only sanctioned inbound access path.
 */
export async function readContextFile(
  path: string,
  opts: ReadContextFileOptions,
): Promise<ContextFile> {
  const repoRel = toRepoRelative(opts.root, path);
  const absPath = resolveContextPath(repoRel, opts.root);

  const cls = classify(repoRel);
  if (!cls) {
    throw new UnreadableError(repoRel, "path does not match any known context-file location");
  }

  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch (e) {
    throw new UnreadableError(repoRel, (e as Error).message, { cause: e });
  }

  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (e) {
    throw new UnreadableError(repoRel, (e as Error).message, { cause: e });
  }
  if (!parsed.hasFrontmatter) {
    throw new SchemaValidationError(repoRel, cls.schemaType, ["file has no frontmatter block"]);
  }

  const result = validateAgainst(opts.registry, cls.schemaType, parsed.data);
  if (!result.valid) {
    throw new SchemaValidationError(repoRel, cls.schemaType, result.issues);
  }

  const declaredVersion = parsed.data.schema_version;
  if (typeof declaredVersion === "string" && !isSchemaVersionAccepted(declaredVersion)) {
    throw new SchemaValidationError(repoRel, cls.schemaType, [
      `schema_version ${declaredVersion} is not accepted by this loader`,
    ]);
  }

  let sourceHash: string | undefined;
  if (cls.quarantined) {
    const declared = parsed.data.source_hash;
    const actual = sha256(parsed.body);
    if (typeof declared !== "string") {
      throw new SchemaValidationError(repoRel, cls.schemaType, [
        "inbound file is missing source_hash",
      ]);
    }
    if (declared !== actual) {
      throw new SourceHashMismatchError(repoRel, declared, actual);
    }
    sourceHash = actual;
  }

  const file: ContextFile = {
    path: repoRel,
    absPath,
    schemaType: cls.schemaType,
    mutability: cls.mutability,
    frontmatter: parsed.data,
    body: parsed.body,
    raw: parsed.raw,
    bytes: Buffer.byteLength(parsed.raw, "utf8"),
    quarantined: cls.quarantined,
  };
  if (sourceHash !== undefined) {
    file.sourceHash = sourceHash;
  }
  return file;
}
