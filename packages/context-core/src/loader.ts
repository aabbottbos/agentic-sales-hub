import { join } from "node:path";
import { resolveContextRoot } from "./config.js";
import { loadSchemas } from "./schema/load.js";
import type { SchemaRegistry } from "./schema/registry.js";
import { readContextFile, toRepoRelative } from "./fs/read.js";
import { walkContext } from "./fs/walk.js";
import { resolveScope, type ScopeParams } from "./scope/resolve.js";
import { search } from "./retrieval/search.js";
import { assertValidRetrievalResult } from "./retrieval/result.js";
import { resolveCitation } from "./provenance/resolve-citation.js";
import { verifyCitation } from "./provenance/verify-citation.js";
import { wrapUntrusted, extractUntrusted } from "./quarantine/wrap.js";
import { createTaintLedger, type TaintLedger } from "./quarantine/taint.js";
import { sha256 } from "./quarantine/hash.js";
import { normalizeNewlines } from "./frontmatter/parse.js";
import { writeFindings } from "./findings/write-findings.js";
import { appendOutcome } from "./outcomes/append-outcome.js";
import { writeArtifact } from "./write-path.js";
import { QuarantineBypassError } from "./errors.js";
import type {
  AppendOutcomeArgs,
  Citation,
  CitationClaim,
  CitationVerdict,
  ContextFile,
  ContextGrants,
  ResolvedCitation,
  RetrievalHit,
  TaintMatch,
  WriteArtifactArgs,
  WriteArtifactResult,
  WriteFindingsArgs,
} from "./types.js";

export interface LoaderOptions {
  /** Directory that `context/` sits in (the repo root, normally). */
  repoRoot: string;
  /** The context corpus root. When omitted, resolved via `resolveContextRoot()`. */
  root?: string;
  /** Defaults to `<repoRoot>/context/schema`. */
  schemaDir?: string;
  /** Injectable clock, for deterministic tests. */
  now?: () => Date;
  /** Defaults to `<repoRoot>/.claude/.taint-ledger.jsonl`. */
  taintLedgerPath?: string;
}

export interface ContextLoader {
  readonly registry: SchemaRegistry;
  read(path: string): Promise<ContextFile>;
  readMany(paths: string[]): Promise<ContextFile[]>;
  list(): Promise<string[]>;
  resolveScope(grants: ContextGrants, params: ScopeParams): Promise<string[]>;
  readScope(grants: ContextGrants, params: ScopeParams): Promise<ContextFile[]>;
  search(scope: ContextFile[], query: string, k?: number): RetrievalHit[];
  assertValidRetrievalResult(result: RetrievalHit[]): void;
  resolveCitation(citation: Citation): Promise<ResolvedCitation>;
  verifyCitation(citation: Citation, claim: CitationClaim): Promise<CitationVerdict>;
  /** The ONLY sanctioned inbound access path. Returns wrapped text; never raw. */
  readInbound(path: string): Promise<{ wrapped: string; hash: string }>;
  /** Recover inner content from a wrapped string (taint already registered). */
  extractUntrusted(wrapped: string): string;
  /** Check a candidate value against the taint ledger. */
  isTainted(value: string): Promise<TaintMatch | null>;
  writeFindings(args: WriteFindingsArgs): Promise<{ artifactPath: string }>;
  appendOutcome(args: AppendOutcomeArgs): Promise<{ outcomesPath: string }>;
  writeArtifact(args: WriteArtifactArgs): Promise<WriteArtifactResult>;
}

/** Build a context loader rooted at `opts.repoRoot`. */
export async function createLoader(opts: LoaderOptions): Promise<ContextLoader> {
  const repoRoot = opts.repoRoot;
  const root = resolveContextRoot({ ...(opts.root ? { root: opts.root } : {}), cwd: repoRoot });
  const schemaDir = opts.schemaDir ?? join(repoRoot, "context/schema");
  const registry = await loadSchemas(schemaDir);
  const ledgerPath = opts.taintLedgerPath ?? join(repoRoot, ".claude/.taint-ledger.jsonl");
  const ledger: TaintLedger = createTaintLedger(ledgerPath);

  const readOne = (path: string): Promise<ContextFile> => readContextFile(path, { root, registry });

  return {
    registry,

    read: readOne,

    readMany: (paths) => Promise.all(paths.map(readOne)),

    list: () => walkContext(root),

    resolveScope: (grants, params) => resolveScope(grants, params, root),

    async readScope(grants, params) {
      const paths = await resolveScope(grants, params, root);
      // Inbound files inside a resolved scope are read through the quarantine
      // path, not returned as plain ContextFiles here — a skill calls
      // readInbound explicitly for the one document it reviews.
      const nonInbound = paths.filter((p) => !p.includes("/inbound/"));
      return Promise.all(nonInbound.map(readOne));
    },

    search: (scope, query, k) => search(scope, query, k),

    assertValidRetrievalResult: (result) => assertValidRetrievalResult(registry, result),

    resolveCitation: (citation) => resolveCitation(citation, root),

    verifyCitation: (citation, claim) => verifyCitation(citation, claim, root),

    async readInbound(path) {
      const repoRel = toRepoRelative(root, path);
      if (!repoRel.includes("/inbound/")) {
        throw new QuarantineBypassError(`${repoRel} is not an inbound document`);
      }
      // read + validate + verify source_hash via the normal reader
      const file = await readOne(repoRel);
      const hash = file.sourceHash ?? sha256(file.body);
      await ledger.register(repoRel, file.body);
      const wrapped = wrapUntrusted(file.body, repoRel, hash);
      return { wrapped, hash };
    },

    extractUntrusted: (wrapped) => extractUntrusted(wrapped),

    isTainted: (value) => ledger.match(value),

    writeFindings: (args) =>
      writeFindings(args, { root, registry, ...(opts.now ? { now: opts.now } : {}) }),

    appendOutcome: (args) => appendOutcome(args, { root, registry }),

    writeArtifact: (args) =>
      writeArtifact(args, { root, registry, ...(opts.now ? { now: opts.now } : {}) }),
  };
}

/** Re-exported so callers can hash raw text the same way the loader does. */
export { sha256, normalizeNewlines };
