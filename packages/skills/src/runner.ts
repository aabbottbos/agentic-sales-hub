import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import { loadSkill } from "./registry.js";
import { findEvidenceImpl } from "./impl/find-evidence.js";
import { sowReviewImpl } from "./impl/sow-review.js";
import type { RunContext, SkillImpl, SkillRunResult } from "./types.js";

const IMPLS: Record<string, SkillImpl> = {
  "find-evidence": findEvidenceImpl as unknown as SkillImpl,
  "sow-review": sowReviewImpl as unknown as SkillImpl,
};

/** Validate raw input against a skill definition's `inputs`. Throws on mismatch. */
export function validateInput(
  def: SkillDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(def.inputs)) {
    const present = name in input && input[name] !== undefined;
    if (!present) {
      if (spec.required) throw new Error(`skill ${def.id}: missing required input "${name}"`);
      continue;
    }
    const value = input[name];
    const actual = typeof value;
    if (actual !== spec.type) {
      throw new Error(`skill ${def.id}: input "${name}" expected ${spec.type}, got ${actual}`);
    }
    if (spec.enum && typeof value === "string" && !spec.enum.includes(value)) {
      throw new Error(`skill ${def.id}: input "${name}" must be one of ${spec.enum.join(", ")}`);
    }
    out[name] = value;
  }
  // reject unknown inputs
  for (const key of Object.keys(input)) {
    if (!(key in def.inputs) && input[key] !== undefined) {
      throw new Error(`skill ${def.id}: unknown input "${key}"`);
    }
  }
  return out;
}

/**
 * Run a skill: load its definition, validate input, dispatch to the impl, then
 * enforce the output contract (schema + `requires_citations`).
 *
 * Grant enforcement: the impl receives the loader and MUST resolve its scope
 * through it. `runSkill` additionally checks that every file the impl reports as
 * read is within the resolved scope.
 */
export async function runSkill(
  id: string,
  input: Record<string, unknown>,
  ctx: RunContext,
): Promise<SkillRunResult> {
  const def = await loadSkill(id);
  const impl = IMPLS[id];
  if (!impl) throw new Error(`no implementation registered for skill "${id}"`);

  const validated = validateInput(def, input);
  const result = await impl.run(validated, ctx, def);

  // Grant enforcement: nothing read outside the resolved scope.
  const scopeSet = new Set(result.scopeResolved);
  for (const readPath of result.contextRead) {
    if (!scopeSet.has(readPath)) {
      throw new Error(`skill ${id} read ${readPath} which is outside its resolved context scope`);
    }
  }

  // Output contract.
  let citationsValid: boolean | undefined;
  if (def.tier === "retrieval") {
    ctx.loader.assertValidRetrievalResult(
      result.output as Parameters<typeof ctx.loader.assertValidRetrievalResult>[0],
    );
    if (def.output.requires_citations) {
      citationsValid = await checkRetrievalCitations(ctx, result.output as RetrievalLike[]);
    }
  } else if (def.tier === "review") {
    const findings = result.output as ReviewFinding[];
    validateFindings(ctx, findings);
    if (def.output.requires_citations) {
      citationsValid = await checkFindingCitations(ctx, findings);
    }
  }

  return {
    skillId: id,
    version: def.version,
    output: result.output,
    scopeResolved: result.scopeResolved,
    contextRead: result.contextRead,
    ...(citationsValid !== undefined ? { citationsValid } : {}),
    trace: result.trace,
  };
}

interface RetrievalLike {
  path: string;
  span: [number, number];
}

interface ReviewFinding {
  finding_id: string;
  severity: "blocker" | "major" | "minor";
  position: "preferred" | "acceptable" | "unacceptable";
  citation: { path: string; span: [number, number] };
}

async function checkRetrievalCitations(ctx: RunContext, hits: RetrievalLike[]): Promise<boolean> {
  for (const hit of hits) {
    try {
      await ctx.loader.resolveCitation({ path: hit.path, span: hit.span });
    } catch {
      return false;
    }
  }
  return true;
}

function validateFindings(ctx: RunContext, findings: ReviewFinding[]): void {
  for (const [i, f] of findings.entries()) {
    const res = ctx.loader.registry.get("finding")(f);
    if (!res) {
      throw new Error(`sow-review output findings[${i}] does not satisfy finding.json`);
    }
  }
}

async function checkFindingCitations(ctx: RunContext, findings: ReviewFinding[]): Promise<boolean> {
  for (const f of findings) {
    const verdict = await ctx.loader.verifyCitation(f.citation, {
      kind: "position",
      position: f.position,
    });
    if (!verdict.valid) return false;
  }
  return true;
}
