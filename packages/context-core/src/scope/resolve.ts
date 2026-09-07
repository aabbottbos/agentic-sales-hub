import { glob } from "tinyglobby";
import { ScopeViolationError } from "../errors.js";
import type { ContextGrants } from "../types.js";

export interface ScopeParams {
  /** Substituted for `{account}` in grant globs. */
  accountSlug?: string;
  /** Substituted for `{opp}` in grant globs. */
  oppId?: string;
  /**
   * When a review skill names a single document, resolution is anchored to it:
   * the result includes exactly this file plus whatever the other grant globs
   * expand to. The path must itself satisfy one of the grant globs.
   */
  documentPath?: string;
}

const PLACEHOLDER_RE = /\{(account|opp)\}/g;

function substitute(pattern: string, params: ScopeParams): string {
  return pattern.replace(PLACEHOLDER_RE, (_m, key: string) => {
    const value = key === "account" ? params.accountSlug : params.oppId;
    if (value === undefined || value === "") {
      throw new ScopeViolationError(
        pattern,
        `grant glob needs {${key}} but no ${key === "account" ? "accountSlug" : "oppId"} was provided`,
      );
    }
    return value;
  });
}

function assertInsideContext(pattern: string): void {
  if (pattern.includes("..") || pattern.startsWith("/") || /^[A-Za-z]:/.test(pattern)) {
    throw new ScopeViolationError(pattern, "grant glob escapes the context root");
  }
  if (!pattern.startsWith("context/")) {
    throw new ScopeViolationError(pattern, "grant glob must be under context/");
  }
}

/**
 * Resolve a skill's read grants to a concrete, sorted list of repo-relative
 * file paths. Pure glob expansion against the real tree — no semantics, ever
 * (spec §4.2). `repoRoot` is the directory `context/` sits in.
 */
export async function resolveScope(
  grants: ContextGrants,
  params: ScopeParams,
  repoRoot: string,
): Promise<string[]> {
  const patterns = grants.read.map((p) => {
    const sub = substitute(p, params);
    assertInsideContext(sub);
    return sub;
  });

  const matched = (await glob(patterns, { cwd: repoRoot, onlyFiles: true, dot: false })).map((m) =>
    m.replaceAll("\\", "/"),
  );

  if (params.documentPath) {
    const doc = params.documentPath.replaceAll("\\", "/");
    if (!matched.includes(doc)) {
      throw new ScopeViolationError(doc, "named document is not within the skill's read grants");
    }
  }

  return [...new Set(matched)].sort();
}
