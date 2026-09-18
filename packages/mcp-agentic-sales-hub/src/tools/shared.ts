import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createLoader, type ContextLoader } from "@agentic-sales-hub/context-core";

/**
 * Repo root, resolved relative to this file's own on-disk location rather
 * than `process.cwd()` — this package is invoked as a standalone process
 * (its `bin` entry), potentially from any working directory, and once built
 * this file lives at `dist/tools/shared.js`. Mirrors the pattern used by
 * `packages/context-core/scripts/validate-corpus.ts`
 * (`dirname(fileURLToPath(import.meta.url))` + a relative `join` up to the
 * repo root), just with one extra `tools/` level to climb out of:
 *   src:  packages/mcp-agentic-sales-hub/src/tools/shared.ts
 *   dist: packages/mcp-agentic-sales-hub/dist/tools/shared.js
 * Both are 4 levels below the repo root.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../../../..");

let sharedLoaderPromise: Promise<ContextLoader> | undefined;

/**
 * Returns the single `ContextLoader` instance shared for the lifetime of
 * this process. Lazily constructed on first call and cached thereafter —
 * every tool handler in this package must call this rather than constructing
 * its own loader, since per-opportunity write serialization (spec 005 OQ#5)
 * and the taint ledger are only consistent guarantees within one loader
 * instance's lifetime.
 */
export function getSharedLoader(): Promise<ContextLoader> {
  if (!sharedLoaderPromise) {
    sharedLoaderPromise = createLoader({
      repoRoot: REPO_ROOT,
      // Both already support an env-var override at the createLoader/
      // resolveContextRoot layer (ASH_CONTEXT_ROOT) or are read here
      // directly (ASH_TAINT_LEDGER_PATH) — this keeps a real deployment
      // able to point the server at a non-default corpus/ledger location,
      // and keeps tests from writing into this repo's own
      // .claude/.taint-ledger.jsonl when they exercise a write-grant tool
      // against a scratch corpus.
      ...(process.env.ASH_TAINT_LEDGER_PATH
        ? { taintLedgerPath: process.env.ASH_TAINT_LEDGER_PATH }
        : {}),
    });
  }
  return sharedLoaderPromise;
}

/**
 * Test-only escape hatch: forces the next `getSharedLoader()` call to
 * construct a fresh loader (e.g. one pointed at a scratch corpus root)
 * instead of returning whatever was cached by a previous call/test.
 */
export function resetSharedLoaderForTests(): void {
  sharedLoaderPromise = undefined;
}

/**
 * Reusable Zod schema for the `actor` field every write-capable MCP tool in
 * this package accepts (`call-prep` here; `call-summary` in Task 9). Mirrors
 * `Actor` from `@agentic-sales-hub/context-core` (`{type: "human"|"system",
 * id: string}`) as a runtime-validatable shape for the MCP SDK's
 * `registerTool()` input schema.
 */
export const actorInputSchema = z.object({
  type: z.enum(["human", "system"]),
  id: z.string().min(1),
});
