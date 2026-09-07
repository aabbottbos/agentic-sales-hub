/**
 * All types exported from @deal-desk/context-core. Kept in one file so the public
 * surface is greppable in a single place.
 */

export type Mutability = "canonical" | "accumulating";
export type SkillTier = "retrieval" | "generation" | "review";
export type Severity = "blocker" | "major" | "minor";
export type ClausePosition = "preferred" | "acceptable" | "unacceptable";

export type OutcomeKind =
  | "sent"
  | "won"
  | "lost"
  | "redline_accepted"
  | "redline_rejected"
  | "superseded"
  | "unused";

/** A byte range `[start, end)` into a file's raw content. */
export type Span = readonly [number, number];

/**
 * A skill's declared context grants. `write` is omitted entirely for review-tier
 * skills — they return findings and a separate step persists them.
 */
export interface ContextGrants {
  read: string[];
  write?: string[];
}

/**
 * A skill definition — data, not prose. One YAML file drives the Claude Code
 * skill, the (future) MCP tool, and the eval runner. See spec §5.3.
 */
export interface SkillDefinition {
  id: string;
  tier: SkillTier;
  version: number;
  context_grants: ContextGrants;
  inputs: Record<
    string,
    { type: "string" | "number" | "boolean"; required?: boolean; enum?: string[] }
  >;
  output: { schema: string; requires_citations: boolean };
  eval_suite: string;
  tools: string[];
}

/** A parsed, schema-validated context file. */
export interface ContextFile {
  /** Repo-relative posix path, e.g. `context/org/company.md`. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Schema type from path classification, e.g. `org-company`, `clause`. */
  schemaType: string;
  mutability: Mutability;
  /** Parsed YAML frontmatter. */
  frontmatter: Record<string, unknown>;
  /** Content after the frontmatter block, LF-normalized. */
  body: string;
  /** The full original file content, LF-normalized. */
  raw: string;
  /** Byte length of `raw`. */
  bytes: number;
  /** Present and verified only for `inbound/**` files. */
  sourceHash?: string;
  /** True for `inbound/**`. Such a file's body is never returned raw to a skill. */
  quarantined: boolean;
}

export interface Citation {
  path: string;
  span: Span;
}

export interface ResolvedCitation {
  citation: Citation;
  /** The exact substring the span points at. */
  text: string;
  /** Up to ~200 chars of context before the span. */
  contextBefore: string;
  /** Up to ~200 chars of context after the span. */
  contextAfter: string;
}

export interface CitationClaim {
  kind: "position" | "assertion";
  /** For `kind: "position"` — the clause position the citation must support. */
  position?: ClausePosition;
  /** For `kind: "assertion"` — the assertion text the citation must support. */
  text?: string;
}

export interface CitationVerdict {
  valid: boolean;
  reason: string;
}

export interface RetrievalHit {
  path: string;
  span: Span;
  /** 0..1 normalized relevance. */
  relevance: number;
  /** Human-readable explanation — which terms matched. */
  why: string;
}

export type RetrievalResult = RetrievalHit[];

/** A structured review finding. Matches `context/schema/finding.json` (spec §5.1). */
export interface Finding {
  finding_id: string;
  /** Repo-relative path of the reviewed inbound document. */
  document: string;
  locator: { clause: string; span: Span };
  issue: string;
  severity: Severity;
  position: ClausePosition;
  /** Resolves into `context/legal/**` and must support `position`. */
  citation: Citation;
  /** Required when `severity` is `blocker` or `major`; optional for `minor`. */
  suggested_redline?: string;
  /** 0..1. */
  confidence: number;
}

/** A hit in the taint ledger: a tool-call argument derived from quarantined content. */
export interface TaintMatch {
  /** Repo-relative path of the `inbound/**` file the content came from. */
  sourcePath: string;
  /** sha256 of that file's body. */
  hash: string;
  /** The overlapping text that triggered the match. */
  matchedText: string;
}

export interface WriteFindingsArgs {
  accountSlug: string;
  crmId: string;
  /** Repo-relative path of the reviewed inbound document. */
  sourceDocument: string;
  findings: Finding[];
  /** Optional explicit artifact id; auto-generated if omitted. */
  artifactId?: string;
}

export interface AppendOutcomeArgs {
  accountSlug: string;
  crmId: string;
  /** Repo-relative path of the artifact this outcome concerns. */
  artifact: string;
  outcome: OutcomeKind;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  note?: string;
}

/** Write operation classes for append-only enforcement. */
export type WriteOp = "create" | "modify" | "delete";
