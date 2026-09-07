import { createHash } from "node:crypto";
import { normalizeNewlines } from "../frontmatter/parse.js";

/**
 * sha256 of a string, computed over its LF-normalized bytes so the hash is
 * stable regardless of the platform that wrote the file. Returns lowercase hex.
 *
 * This is the function used for `inbound/**` `source_hash` verification and for
 * taint-ledger entries.
 */
export function sha256(text: string): string {
  return createHash("sha256").update(normalizeNewlines(text), "utf8").digest("hex");
}
