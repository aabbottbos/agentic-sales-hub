/**
 * Typed errors for @deal-desk/context-core. Every error carries a stable `.code`
 * so callers (skills, the eval runner, hooks) can branch without string matching.
 */

export type DealDeskErrorCode =
  | "SCHEMA_VALIDATION"
  | "SOURCE_HASH_MISMATCH"
  | "CITATION_UNRESOLVABLE"
  | "CITATION_UNSUPPORTED"
  | "SCOPE_VIOLATION"
  | "APPEND_ONLY_VIOLATION"
  | "QUARANTINE_BYPASS"
  | "UNREADABLE";

export abstract class DealDeskError extends Error {
  abstract readonly code: DealDeskErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A context file's frontmatter failed JSON Schema validation. */
export class SchemaValidationError extends DealDeskError {
  readonly code = "SCHEMA_VALIDATION" as const;
  readonly path: string;
  readonly schemaType: string;
  readonly issues: string[];

  constructor(path: string, schemaType: string, issues: string[]) {
    super(`Schema validation failed for ${path} (${schemaType}):\n  ${issues.join("\n  ")}`);
    this.path = path;
    this.schemaType = schemaType;
    this.issues = issues;
  }
}

/** An inbound/** file's body hash does not match its declared `source_hash`. */
export class SourceHashMismatchError extends DealDeskError {
  readonly code = "SOURCE_HASH_MISMATCH" as const;
  readonly path: string;
  readonly declared: string;
  readonly actual: string;

  constructor(path: string, declared: string, actual: string) {
    super(
      `source_hash mismatch for ${path}: frontmatter declares ${declared}, body hashes to ${actual}`,
    );
    this.path = path;
    this.declared = declared;
    this.actual = actual;
  }
}

/** A citation `{path, span}` does not resolve to real text. */
export class CitationUnresolvableError extends DealDeskError {
  readonly code = "CITATION_UNRESOLVABLE" as const;
  readonly citationPath: string;
  readonly span: readonly [number, number];

  constructor(citationPath: string, span: readonly [number, number], reason: string) {
    super(`Citation ${citationPath}[${span[0]}..${span[1]}] is unresolvable: ${reason}`);
    this.citationPath = citationPath;
    this.span = span;
  }
}

/** Cited text resolves but does not support the claim/position it is attached to. */
export class CitationUnsupportedError extends DealDeskError {
  readonly code = "CITATION_UNSUPPORTED" as const;
  readonly citationPath: string;

  constructor(citationPath: string, reason: string) {
    super(`Citation ${citationPath} does not support its claim: ${reason}`);
    this.citationPath = citationPath;
  }
}

/** A skill tried to read or write a path outside its declared context grants. */
export class ScopeViolationError extends DealDeskError {
  readonly code = "SCOPE_VIOLATION" as const;
  readonly attemptedPath: string;

  constructor(attemptedPath: string, reason: string) {
    super(`Scope violation for ${attemptedPath}: ${reason}`);
    this.attemptedPath = attemptedPath;
  }
}

/** A write violated the append-only rule for accumulating context. */
export class AppendOnlyViolationError extends DealDeskError {
  readonly code = "APPEND_ONLY_VIOLATION" as const;
  readonly targetPath: string;
  readonly operation: string;

  constructor(targetPath: string, operation: string, reason: string) {
    super(`Append-only violation: ${operation} on ${targetPath} — ${reason}`);
    this.targetPath = targetPath;
    this.operation = operation;
  }
}

/** Raw inbound/** content was accessed outside the quarantine wrapper. */
export class QuarantineBypassError extends DealDeskError {
  readonly code = "QUARANTINE_BYPASS" as const;

  constructor(reason: string) {
    super(`Quarantine bypass: ${reason}`);
  }
}

/** A file could not be read or parsed at all. */
export class UnreadableError extends DealDeskError {
  readonly code = "UNREADABLE" as const;
  readonly path: string;

  constructor(path: string, reason: string, options?: { cause?: unknown }) {
    super(`Cannot read ${path}: ${reason}`, options);
    this.path = path;
  }
}
