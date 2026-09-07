import type { ContextLoader, Finding, RetrievalHit } from "@deal-desk/context-core";

export interface CitationScore {
  /** valid citations / total citations */
  validity: number;
  valid: number;
  total: number;
  failures: string[];
}

/**
 * Citation validity for review findings: every finding's citation must resolve
 * AND `verifyCitation` must confirm it supports the finding's `position`.
 */
export async function scoreFindingCitations(
  loader: ContextLoader,
  findings: Finding[],
): Promise<CitationScore> {
  let valid = 0;
  const failures: string[] = [];
  for (const f of findings) {
    const verdict = await loader.verifyCitation(f.citation, {
      kind: "position",
      position: f.position,
    });
    if (verdict.valid) valid++;
    else failures.push(`${f.finding_id}: ${verdict.reason}`);
  }
  return {
    validity: findings.length === 0 ? 1 : valid / findings.length,
    valid,
    total: findings.length,
    failures,
  };
}

/** Citation validity for retrieval hits: every `{path, span}` must resolve. */
export async function scoreRetrievalCitations(
  loader: ContextLoader,
  hits: RetrievalHit[],
): Promise<CitationScore> {
  let valid = 0;
  const failures: string[] = [];
  for (const h of hits) {
    try {
      await loader.resolveCitation({ path: h.path, span: h.span });
      valid++;
    } catch (e) {
      failures.push(`${h.path}[${h.span.join("..")}]: ${(e as Error).message}`);
    }
  }
  return {
    validity: hits.length === 0 ? 1 : valid / hits.length,
    valid,
    total: hits.length,
    failures,
  };
}
