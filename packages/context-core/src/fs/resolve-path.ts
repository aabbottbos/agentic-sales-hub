import { isAbsolute, join, relative } from "node:path";
import { ScopeViolationError } from "../errors.js";

/**
 * Resolve a logical `context/...` path to a physical path under `root`.
 *
 * The `context/` prefix is a logical marker, not a real directory once the
 * corpus has moved behind a tenant-scoped root — so this strips exactly one
 * leading `context/` segment and joins the remainder onto `root`.
 *
 * Absolute input passes through unchanged; `root` is not touched at all in
 * that case. A relative input that does not start with `context/` throws a
 * `ScopeViolationError` — this is a defensive backstop for a caller bug, not
 * a data-validation concern (`assertInsideContext` in `scope/resolve.ts` is
 * the primary well-formedness check for grant globs). Reusing that error
 * type (rather than a plain `Error`) lets callers branch on it the same way
 * they already do for a grant that escapes its scope.
 */
export function resolveContextPath(logicalPath: string, root: string): string {
  const normalized = logicalPath.replaceAll("\\", "/");

  if (isAbsolute(normalized)) {
    return normalized;
  }

  if (normalized !== "context" && !normalized.startsWith("context/")) {
    throw new ScopeViolationError(logicalPath, 'relative path must start with "context/"');
  }

  const rest = normalized === "context" ? "" : normalized.slice("context/".length);
  return join(root, rest);
}

/**
 * Inverse of `resolveContextPath`: a physical path under `root` (absolute or
 * root-relative) back to its logical `context/...` string.
 *
 * Output is always posix-style (`/`-separated), regardless of platform or
 * the separators in the input.
 */
export function toLogicalContextPath(absOrRel: string, root: string): string {
  const normalizedInput = absOrRel.replaceAll("\\", "/");
  const normalizedRoot = root.replaceAll("\\", "/");

  const rel = isAbsolute(normalizedInput)
    ? relative(normalizedRoot, normalizedInput)
    : normalizedInput;

  const posixRel = rel.replaceAll("\\", "/");
  return posixRel === "" ? "context" : `context/${posixRel}`;
}
