import type {
  ContextLoader,
  Finding,
  RetrievalHit,
  SkillDefinition,
} from "@agentic-sales-hub/context-core";

export type { SkillDefinition };

/** Product skill ids whose `.claude/skills/<id>/SKILL.md` is generated + drift-checked. */
export const PRODUCT_SKILL_IDS = ["call-summary", "find-evidence", "sow-review"] as const;
export type ProductSkillId = (typeof PRODUCT_SKILL_IDS)[number];

export interface RunContext {
  loader: ContextLoader;
  scopeParams: { accountSlug?: string; oppId?: string };
}

export interface TraceEntry {
  step: string;
  detail: string;
}

export interface SkillRunResult<T = unknown> {
  skillId: string;
  version: number;
  output: T;
  /** Repo-relative files the skill's scope resolved to. */
  scopeResolved: string[];
  /** Repo-relative files the skill actually read. */
  contextRead: string[];
  /** Present for skills whose definition sets `output.requires_citations`. */
  citationsValid?: boolean;
  trace: TraceEntry[];
}

/** A skill implementation: pure function from validated input + context to output. */
export interface SkillImpl<Input = Record<string, unknown>, Output = unknown> {
  run(input: Input, ctx: RunContext, def: SkillDefinition): Promise<SkillImplResult<Output>>;
}

export interface SkillImplResult<Output = unknown> {
  output: Output;
  scopeResolved: string[];
  contextRead: string[];
  trace: TraceEntry[];
}

export type FindEvidenceOutput = RetrievalHit[];
export type SowReviewOutput = Finding[];

export type { SummaryOutput } from "./impl/summary-schema.js";
export type CallSummaryOutput = import("./impl/summary-schema.js").SummaryOutput;
