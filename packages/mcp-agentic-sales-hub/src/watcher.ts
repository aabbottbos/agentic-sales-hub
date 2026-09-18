import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { ContextLoader } from "@agentic-sales-hub/context-core";
import { runSkill } from "@agentic-sales-hub/skills";
import type { SummaryOutput } from "@agentic-sales-hub/skills";
import { assertNotTainted, getSharedLoader, REPO_ROOT } from "./tools/shared.js";
import { renderCallSummaryBody } from "./tools/render-call-summary.js";
import { parseOpportunityPath } from "./tools/call-summary-tool.js";

/**
 * Fixed sentinel actor for every artifact this watcher persists. Per plan 005
 * Task 10: this is the "no human in the loop" trigger, so there is no real
 * human actor to attribute the write to — a stable, recognizable system
 * identity instead ({type:"system", id:"file-watcher"}), distinct from the
 * eval runner's own sentinel ({type:"system", id:"eval-runner"}, Task 4) and
 * the backfill migration's ({type:"system", id:"legacy"}, Task 2).
 */
export const FILE_WATCHER_ACTOR = { type: "system", id: "file-watcher" } as const;

export interface CreateInboundWatcherOptions {
  /** Shared `ContextLoader` — MUST be the same instance the rest of the
   *  process (MCP tools, eval-suite driver) uses, so per-opportunity write
   *  serialization and the taint ledger stay consistent (plan 005 Task 10). */
  loader: ContextLoader;
  /** Directory containing `context/` (the corpus's parent, not the corpus
   *  root itself — mirrors `LoaderOptions.repoRoot`). */
  repoRoot: string;
  /** Per-path debounce window, in ms. Coalesces a burst of `fs.watch` events
   *  for the same path (temp-file-then-rename, multiple write flushes, etc.)
   *  into exactly one processing trigger, fired after the burst settles.
   *  Default ~400ms per the plan. */
  debounceMs?: number;
}

export interface InboundWatcher {
  /** Stops the underlying `fs.watch` handle and clears any pending debounce
   *  timers. Idempotent — safe to call more than once. */
  close(): void;
}

/** Mirrors `parseOpportunityPath`'s own regex indirectly (via that function)
 *  — this constant is only used to cheaply pre-filter events to ones that
 *  even look like they're under an `inbound/` directory, before paying for
 *  the full opportunity-shape parse. */
const INBOUND_SEGMENT = "/inbound/";

/**
 * Watches `<repoRoot>/context` for new/changed files under any
 * `.../opportunities/<crmId>/inbound/**` directory and, per settled file,
 * drives the same render -> taint-check -> persist pipeline Task 9's
 * `call-summary` MCP tool established (imported here, not reimplemented):
 * `runSkill("call-summary", ...)` -> `renderCallSummaryBody` ->
 * `assertNotTainted` -> `loader.writeArtifact(...)`, attributed to the fixed
 * `FILE_WATCHER_ACTOR` sentinel.
 *
 * This is the steel thread's one real automatic trigger (plan 005 intent
 * scope): a file dropped into `inbound/**` — by a human, or in a real
 * deployment some future Gong/Zoom integration — gets summarized and
 * persisted with no human action.
 *
 * Uses `fs.watch(..., {recursive:true})` rather than a polling library —
 * sufficient for this steel-thread scope (Linux/macOS, which is what CI/dev
 * use); `filename` is not guaranteed non-null on every platform per Node's
 * own docs, but is reliable there. Node's `fs.watch` fires `rename` events
 * for both creates AND deletes (there's no dedicated "create" event type) and
 * commonly fires more than one event for what is conceptually a single
 * "file appeared" occurrence, which is exactly what the per-path debounce
 * below coalesces.
 */
export function createInboundWatcher(options: CreateInboundWatcherOptions): InboundWatcher {
  const { loader, repoRoot } = options;
  const debounceMs = options.debounceMs ?? 400;
  const contextDir = join(repoRoot, "context");

  const timers = new Map<string, NodeJS.Timeout>();

  function scheduleProcessing(logicalPath: string): void {
    const existing = timers.get(logicalPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      timers.delete(logicalPath);
      // Fire-and-forget from fs.watch's synchronous event callback's point of
      // view; errors are caught and logged inside processFile itself so a
      // rejection here can never surface as an unhandled rejection.
      void processFile(loader, logicalPath);
    }, debounceMs);

    // Never hold the process open on account of a pending debounce timer —
    // matters for tests and for clean process shutdown.
    timer.unref?.();
    timers.set(logicalPath, timer);
  }

  function onFsEvent(_eventType: string, filename: string | Buffer | null): void {
    if (filename == null) return; // Not guaranteed non-null on every platform.
    const rel = (typeof filename === "string" ? filename : filename.toString()).replaceAll(
      "\\",
      "/",
    );

    // fs.watch's filename is relative to the watched directory (context/
    // itself), not the repo root — reconstruct the repo-relative logical
    // path the rest of the system (parseOpportunityPath, loader.readInbound,
    // runSkill's grant resolution) expects.
    const logicalPath = `context/${rel}`;

    if (!logicalPath.includes(INBOUND_SEGMENT)) return; // Ignore non-inbound tree changes.

    scheduleProcessing(logicalPath);
  }

  const fsWatcher: FSWatcher = watch(contextDir, { recursive: true }, onFsEvent);
  // Same rationale as the per-path debounce timers: a live fs.watch handle
  // must never be the thing keeping the process (or a test runner) alive.
  fsWatcher.unref?.();

  async function processFile(loaderArg: ContextLoader, logicalPath: string): Promise<void> {
    let accountSlug: string;
    let crmId: string;
    try {
      ({ accountSlug, crmId } = parseOpportunityPath(logicalPath));
    } catch {
      // Non-opportunity-shaped inbound-looking path (malformed, or an
      // inbound/ directory outside the accounts/*/opportunities/* shape) —
      // silently skip. A background watcher must never let one bad event
      // path crash the process or take down future processing.
      console.error(
        `[inbound-watcher] skipping "${logicalPath}": does not match ` +
          `context/accounts/<slug>/opportunities/<crmId>/... shape`,
      );
      return;
    }

    try {
      const result = await runSkill(
        "call-summary",
        { meeting_path: logicalPath },
        { loader: loaderArg, scopeParams: {}, actor: FILE_WATCHER_ACTOR },
      );

      const rendered = renderCallSummaryBody(result.output as SummaryOutput);

      await assertNotTainted(loaderArg, rendered.body, ...rendered.citations.map((c) => c.claim));

      await loaderArg.writeArtifact({
        accountSlug,
        crmId,
        kind: "summary",
        generatedBy: "call-summary",
        title: rendered.title,
        body: rendered.body,
        citations: rendered.citations,
        unsourcedClaims: rendered.unsourcedClaims,
        actor: FILE_WATCHER_ACTOR,
      });
    } catch (error) {
      // A real error, a taint-check refusal, an LLM failure, etc. This is a
      // long-running background process — one bad file must not take down
      // summarization for every future file. Log and keep watching.
      console.error(`[inbound-watcher] failed to process "${logicalPath}":`, error);
    }
  }

  return {
    close(): void {
      fsWatcher.close();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

/**
 * Constructs the watcher against this process's single shared `ContextLoader`
 * (`getSharedLoader()`, the same instance every MCP tool handler uses) and
 * repo root, awaiting the loader before the underlying `fs.watch()` call is
 * made. This is `server.ts`'s startup sequence's watcher half — called from
 * there (and, transitively, `index.ts`'s `main()`), not folded into
 * `createServer()`/`startServer()` themselves so their existing
 * synchronous-construction / resolved-value contracts (relied on by the Task
 * 7-9 tests) stay unchanged.
 */
export async function createInboundWatcherForServer(debounceMs?: number): Promise<InboundWatcher> {
  const loader = await getSharedLoader();
  return createInboundWatcher({
    loader,
    repoRoot: REPO_ROOT,
    ...(debounceMs !== undefined ? { debounceMs } : {}),
  });
}
