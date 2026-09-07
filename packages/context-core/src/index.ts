// @deal-desk/context-core — the context substrate loader and security boundary.

export { createLoader } from "./loader.js";
export type { ContextLoader, LoaderOptions } from "./loader.js";

export { sha256, normalizeNewlines } from "./loader.js";

// Schema
export { loadSchemas } from "./schema/load.js";
export {
  createRegistry,
  isSchemaVersionAccepted,
  SCHEMA_TYPES,
  SCHEMA_VERSION,
} from "./schema/registry.js";
export type { SchemaRegistry, SchemaType } from "./schema/registry.js";
export { validateAgainst } from "./schema/validate.js";
export type { ValidationResult } from "./schema/validate.js";

// Frontmatter / classification
export { parseFrontmatter } from "./frontmatter/parse.js";
export type { ParsedFrontmatter } from "./frontmatter/parse.js";
export { classify, isContextFile } from "./frontmatter/classify.js";
export type { Classification } from "./frontmatter/classify.js";

// Filesystem
export { readContextFile, toRepoRelative } from "./fs/read.js";
export { walkContext } from "./fs/walk.js";
export { assertAppendOnly, frontmatterDelta } from "./fs/append-only.js";
export type { FrontmatterDelta } from "./fs/append-only.js";

// Scope
export { resolveScope } from "./scope/resolve.js";
export type { ScopeParams } from "./scope/resolve.js";

// Retrieval
export { search } from "./retrieval/search.js";
export { assertValidRetrievalResult } from "./retrieval/result.js";

// Provenance
export { resolveCitation } from "./provenance/resolve-citation.js";
export { verifyCitation } from "./provenance/verify-citation.js";

// Quarantine
export { wrapUntrusted, extractUntrusted } from "./quarantine/wrap.js";
export {
  createTaintLedger,
  normalizeForMatch,
  shingles,
  DEFAULT_SHINGLE_THRESHOLD,
} from "./quarantine/taint.js";
export type { TaintLedger, TaintLedgerEntry } from "./quarantine/taint.js";

// Findings / outcomes
export { writeFindings } from "./findings/write-findings.js";
export { appendOutcome } from "./outcomes/append-outcome.js";

// Errors
export {
  DealDeskError,
  SchemaValidationError,
  SourceHashMismatchError,
  CitationUnresolvableError,
  CitationUnsupportedError,
  ScopeViolationError,
  AppendOnlyViolationError,
  QuarantineBypassError,
  UnreadableError,
} from "./errors.js";
export type { DealDeskErrorCode } from "./errors.js";

// Types
export type {
  Mutability,
  SkillTier,
  Severity,
  ClausePosition,
  OutcomeKind,
  Span,
  ContextGrants,
  SkillDefinition,
  ContextFile,
  Citation,
  ResolvedCitation,
  CitationClaim,
  CitationVerdict,
  RetrievalHit,
  RetrievalResult,
  Finding,
  TaintMatch,
  WriteFindingsArgs,
  AppendOutcomeArgs,
  WriteOp,
} from "./types.js";
