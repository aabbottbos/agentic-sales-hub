import { classify } from "../frontmatter/classify.js";
import { parseFrontmatter } from "../frontmatter/parse.js";
import { resolveCitation } from "./resolve-citation.js";
import { readFile } from "node:fs/promises";
import { normalizeNewlines } from "../frontmatter/parse.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import type { Citation, CitationClaim, CitationVerdict } from "../types.js";

/**
 * Deterministically verify that a citation supports its claim.
 *
 * Phase 0 semantics (spec judgment call #5 — the loader owns this, not a model):
 *
 * - `kind: "position"` (the `sow-review` case): the cited file must be a
 *   `clause` in `context/legal/clause-library/**`, its frontmatter `position`
 *   must equal `claim.position`, and the cited span must fall within (or overlap)
 *   the clause file — i.e. the citation points at the clause that establishes the
 *   position, not somewhere unrelated.
 * - `kind: "assertion"`: the cited text must contain the claim text
 *   (case-insensitive, whitespace-collapsed) as a substring.
 *
 * `root` is the physical corpus root.
 */
export async function verifyCitation(
  citation: Citation,
  claim: CitationClaim,
  root: string,
): Promise<CitationVerdict> {
  let resolved;
  try {
    resolved = await resolveCitation(citation, root);
  } catch (e) {
    return { valid: false, reason: `citation does not resolve: ${(e as Error).message}` };
  }

  if (claim.kind === "assertion") {
    if (!claim.text) {
      return { valid: false, reason: "assertion claim has no text" };
    }
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm(resolved.text).includes(norm(claim.text))) {
      return { valid: true, reason: "cited text contains the asserted claim" };
    }
    return { valid: false, reason: "cited text does not contain the asserted claim" };
  }

  // kind: "position"
  if (!claim.position) {
    return { valid: false, reason: "position claim has no position" };
  }
  const cls = classify(citation.path);
  if (!cls || cls.schemaType !== "clause") {
    return {
      valid: false,
      reason: `citation must point at a clause-library entry; ${citation.path} is ${cls?.schemaType ?? "unclassifiable"}`,
    };
  }

  const abs = resolveContextPath(citation.path, root);
  let fm;
  try {
    const raw = normalizeNewlines(await readFile(abs, "utf8"));
    fm = parseFrontmatter(raw).data;
  } catch (e) {
    return { valid: false, reason: `cannot read cited clause file: ${(e as Error).message}` };
  }

  if (fm.position !== claim.position) {
    return {
      valid: false,
      reason: `clause position is "${String(fm.position)}", finding claims "${claim.position}"`,
    };
  }

  return {
    valid: true,
    reason: `clause ${String(fm.clause_id)} establishes position "${claim.position}"`,
  };
}
