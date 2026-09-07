import type { SkillDefinition } from "@deal-desk/context-core";
import type { FindEvidenceOutput, RunContext, SkillImpl, SkillImplResult } from "../types.js";

interface FindEvidenceInput {
  situation: string;
  account_slug?: string;
  k?: number;
}

/**
 * Deterministic retrieval-tier impl (D5). Resolves the skill's read scope,
 * loads it, and ranks it lexically with the context-core BM25-lite `search`.
 * Never widens the scope. Phase 1 swaps a real ranking layer here with no
 * contract change.
 */
export const findEvidenceImpl: SkillImpl<FindEvidenceInput, FindEvidenceOutput> = {
  async run(
    input: FindEvidenceInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<FindEvidenceOutput>> {
    const trace = [];
    const scopeParams = input.account_slug ? { accountSlug: input.account_slug } : ctx.scopeParams;

    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, scopeParams);
    trace.push({ step: "resolveScope", detail: `${scopeResolved.length} files in scope` });

    const files = await ctx.loader.readScope(def.context_grants, scopeParams);
    trace.push({ step: "readScope", detail: `read ${files.length} files` });

    const k = typeof input.k === "number" ? input.k : 10;
    const hits = ctx.loader.search(files, input.situation, k);
    trace.push({
      step: "search",
      detail: `${hits.length} hits for "${input.situation.slice(0, 60)}"`,
    });

    ctx.loader.assertValidRetrievalResult(hits);

    return {
      output: hits,
      scopeResolved,
      contextRead: files.map((f) => f.path),
      trace,
    };
  },
};
