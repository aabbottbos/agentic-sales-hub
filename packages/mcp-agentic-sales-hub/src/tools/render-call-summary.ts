import type { ArtifactCitationInput } from "@agentic-sales-hub/context-core";
import type { SummaryOutput } from "@agentic-sales-hub/skills";

/**
 * Shape `writeArtifact` needs from a rendered generation output: markdown
 * `body` plus a flattened citation list. Mirrors `RenderedArtifact` in
 * `packages/skills/src/runner.ts` (the call-prep precedent) field-for-field,
 * so both renderers can feed `WriteArtifactArgs` identically.
 */
export interface RenderedArtifact {
  title: string;
  body: string;
  citations: ArtifactCitationInput[];
  unsourcedClaims: string[];
}

/**
 * Renders a call-summary `SummaryOutput` into an artifact body + flattened
 * frontmatter citations, exactly mirroring `renderCallPrepBody` in
 * `packages/skills/src/runner.ts` — the in-package precedent for turning a
 * generation skill's structured output into what `writeArtifact` needs.
 *
 * This renderer lives in this package (not `packages/skills`) because
 * `call-summary` has no write grant: `runSkill` only returns its structured
 * output, and THIS package is the "separate step" that persists it (the
 * `write-findings.ts` precedent for review-tier skills, applied here to a
 * generation-tier skill with no write grant). Colocating the renderer with
 * `call-summary-tool.ts` — the code that actually calls `loader.writeArtifact`
 * for this skill — keeps the rendering and persisting logic in one place.
 */
export function renderCallSummaryBody(output: SummaryOutput): RenderedArtifact {
  const citations: ArtifactCitationInput[] = [];

  const ownerTag = (owner: SummaryOutput["commitments"][number]["owner"]): string => `[${owner}]`;

  const itemSection = (title: string, items: SummaryOutput["commitments"]): string => {
    if (items.length === 0) return "";
    const lines = items.map((it) => {
      citations.push({ claim: it.text, path: it.citation.path, span: it.citation.span });
      return `- ${ownerTag(it.owner)} ${it.text}`;
    });
    return `\n## ${title}\n\n${lines.join("\n")}\n`;
  };

  const deltaSection = (title: string, items: SummaryOutput["context_deltas"]): string => {
    if (items.length === 0) return "";
    const lines = items.map((it) => {
      citations.push({ claim: it.observation, path: it.citation.path, span: it.citation.span });
      return `- **${it.field}**: ${it.observation}`;
    });
    return `\n## ${title}\n\n${lines.join("\n")}\n`;
  };

  for (const c of output.citations) {
    citations.push({ claim: "(overall source)", path: c.path, span: c.span });
  }

  const body = [
    "# Call summary",
    "",
    output.summary,
    itemSection("Commitments", output.commitments),
    itemSection("Next steps", output.next_steps),
    deltaSection("Context deltas", output.context_deltas),
  ].join("\n");

  return {
    title: "Call summary",
    body,
    citations,
    unsourcedClaims: output.unsourced_claims,
  };
}
