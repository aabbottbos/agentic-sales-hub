import matter from "gray-matter";

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  /** Content after the frontmatter block, LF-normalized. */
  body: string;
  /** The full original text, LF-normalized. */
  raw: string;
  /** True if a `---` frontmatter block was present. */
  hasFrontmatter: boolean;
}

/** Normalize CRLF/CR to LF so byte offsets and hashes are stable across platforms. */
export function normalizeNewlines(text: string): string {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/**
 * Parse YAML frontmatter from a Markdown file's text. Throws on malformed YAML.
 * The returned `body` and `raw` are LF-normalized; `raw` is what should be hashed.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const raw = normalizeNewlines(text);
  const hasFrontmatter = /^---\r?\n/.test(raw);
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    throw new Error(`malformed frontmatter: ${(e as Error).message}`);
  }
  return {
    data: (parsed.data ?? {}) as Record<string, unknown>,
    body: normalizeNewlines(parsed.content).replace(/^\n/, ""),
    raw,
    hasFrontmatter,
  };
}
