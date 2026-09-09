import type { RetrievalHit } from "@agentic-sales-hub/context-core";

export interface LabeledSpan {
  path: string;
  span: [number, number];
  required: boolean;
}

export interface RetrievalScore {
  /** covered required spans / total required spans */
  recall: number;
  /** covered spans among the top-k / k */
  precisionAtK: number;
  /** k used for precisionAtK */
  k: number;
  coveredRequired: number;
  totalRequired: number;
}

/** A hit covers a labeled span if same path and >= 50% of the span's length overlaps. */
export function covers(hit: RetrievalHit, span: LabeledSpan): boolean {
  if (hit.path !== span.path) return false;
  const [hs, he] = hit.span;
  const [ss, se] = span.span;
  const overlap = Math.max(0, Math.min(he, se) - Math.max(hs, ss));
  const spanLen = Math.max(1, se - ss);
  return overlap / spanLen >= 0.5;
}

export function scoreRetrieval(hits: RetrievalHit[], labels: LabeledSpan[], k = 5): RetrievalScore {
  const required = labels.filter((l) => l.required);
  const coveredRequired = required.filter((l) => hits.some((h) => covers(h, l))).length;
  const recall = required.length === 0 ? 1 : coveredRequired / required.length;

  const topK = hits.slice(0, k);
  const coveredInTopK = topK.filter((h) => labels.some((l) => covers(h, l))).length;
  const precisionAtK = k === 0 ? 0 : coveredInTopK / k;

  return {
    recall,
    precisionAtK,
    k,
    coveredRequired,
    totalRequired: required.length,
  };
}
