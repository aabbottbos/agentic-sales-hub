import { readFile } from "node:fs/promises";
import { CitationUnresolvableError } from "../errors.js";
import { normalizeNewlines } from "../frontmatter/parse.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import type { Citation, ResolvedCitation } from "../types.js";

const CONTEXT_CHARS = 200;

/**
 * Resolve a `{path, span}` citation to the exact text it points at, plus a
 * window of surrounding context. The span is a `[start, end)` byte range into
 * the file's LF-normalized raw content (frontmatter included — spans are
 * absolute file offsets).
 *
 * `root` is the physical corpus root.
 */
export async function resolveCitation(citation: Citation, root: string): Promise<ResolvedCitation> {
  const [start, end] = citation.span;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new CitationUnresolvableError(
      citation.path,
      citation.span,
      "span is not a valid [start, end) range",
    );
  }

  const abs = resolveContextPath(citation.path, root);
  let raw: string;
  try {
    raw = normalizeNewlines(await readFile(abs, "utf8"));
  } catch (e) {
    throw new CitationUnresolvableError(citation.path, citation.span, (e as Error).message);
  }

  if (end > raw.length) {
    throw new CitationUnresolvableError(
      citation.path,
      citation.span,
      `span end ${end} exceeds file length ${raw.length}`,
    );
  }

  return {
    citation,
    text: raw.slice(start, end),
    contextBefore: raw.slice(Math.max(0, start - CONTEXT_CHARS), start),
    contextAfter: raw.slice(end, Math.min(raw.length, end + CONTEXT_CHARS)),
  };
}
