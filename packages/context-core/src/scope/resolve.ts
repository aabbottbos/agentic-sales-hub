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
 * Resolve a skill's read grants to a concrete, sorted list of LOGICAL
 * `context/...`-prefixed file paths. Pure glob expansion against the real
 * tree — no semantics, ever (spec §4.2). `root` is the physical corpus root
 * (what `context/` logically refers to); grant globs are logical
 * `context/...` patterns, stripped of that prefix before globbing against
 * `root`, then re-prefixed so the return value stays logical.
 */
export async function resolveScope(
  grants: ContextGrants,
  params: ScopeParams,
  root: string,
): Promise<string[]> {
  const patterns = grants.read.map((p) => {
    const sub = substitute(p, params);
    assertInsideContext(sub);
    return sub;
  });

  // assertInsideContext guarantees every pattern starts with "context/".
  const strippedPatterns = patterns.map((p) => p.slice("context/".length));

  const matched = (await glob(strippedPatterns, { cwd: root, onlyFiles: true, dot: false })).map(
    (m) => `context/${m.replaceAll("\\", "/")}`,
  );

  if (params.documentPath) {
    const doc = params.documentPath.replaceAll("\\", "/");
    if (!matched.includes(doc)) {
      throw new ScopeViolationError(doc, "named document is not within the skill's read grants");
    }
  }

  return [...new Set(matched)].sort();
}
