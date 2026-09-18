#!/usr/bin/env node
import { createServer, startInboundWatcher, startServer } from "./server.js";

// Re-exported (Task 10) so the eval suite (plan 005 Task 11) can drive the
// watcher directly in-process against a scratch corpus, rather than through
// a real subprocess.
export { createInboundWatcher, FILE_WATCHER_ACTOR } from "./watcher.js";
export type { CreateInboundWatcherOptions, InboundWatcher } from "./watcher.js";

// Re-exported (Task 11) so the eval suite can drive call-summary through an
// actual registered MCP tool handler for the "once via an MCP tool call"
// variant spec 005's Eval-impact section calls for, and share this process's
// single loader construction (getSharedLoader/resetSharedLoaderForTests) the
// same way every tool handler in this package does — rather than the eval
// suite building its own separate ContextLoader for this one case.
export { registerCallSummaryTool } from "./tools/call-summary-tool.js";
export { getSharedLoader, resetSharedLoaderForTests } from "./tools/shared.js";

async function main(): Promise<void> {
  const server = createServer();
  // Sharing the same getSharedLoader()-cached ContextLoader instance the
  // tools use (required for per-opportunity queue / taint-ledger consistency
  // — plan 005 Task 10).
  const watcher = await startInboundWatcher();
  const shutdown = (): void => {
    watcher.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await startServer(server);
}

// Only run the entrypoint when this module is the process's actual entry —
// importing it (e.g. to reuse the createInboundWatcher re-export above) must
// never also start a stdio server / register shutdown handlers.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error("agentic-sales-hub-mcp failed to start:", error);
    process.exitCode = 1;
  });
}
