import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCallPrepTool } from "./tools/call-prep-tool.js";
import { registerCallSummaryTool } from "./tools/call-summary-tool.js";
import { createInboundWatcherForServer, type InboundWatcher } from "./watcher.js";

/**
 * Package version is not read from package.json at runtime (no JSON import
 * assertions in this build target); keep this literal in sync with
 * package.json's "version" field.
 */
const SERVER_VERSION = "0.0.0";

/**
 * Builds the Agentic Sales Hub MCP server.
 *
 * Registers `call-prep` (plan 005, Task 8) and `call-summary` (Task 9).
 *
 * Stays synchronous and free of the Task 10 file watcher on purpose: this
 * constructor's resolved-value contract is relied on by the Task 7-9 tests
 * (`createServer(): McpServer`, no await). The watcher is a separate
 * long-running background resource with its own async construction
 * (`getSharedLoader()` must resolve before `fs.watch()` can start) — see
 * `startInboundWatcher()` below, the real startup sequence's watcher half.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "agentic-sales-hub",
    version: SERVER_VERSION,
  });

  registerCallPrepTool(server);
  registerCallSummaryTool(server);

  return server;
}

/**
 * Connects the given server to a stdio transport and starts listening.
 *
 * Defaults to `process.stdin`/`process.stdout` when no transport is passed,
 * which is the shape used by the real entrypoint (`src/index.ts`); tests pass
 * an explicit transport (or construct one against non-process streams) so
 * they don't hijack the test runner's own stdio.
 */
export async function startServer(
  server: McpServer,
  transport: StdioServerTransport = new StdioServerTransport(),
): Promise<void> {
  await server.connect(transport);
}

/**
 * Starts the inbound file watcher (plan 005, Task 10) sharing this process's
 * single `ContextLoader` (`getSharedLoader()` in `./tools/shared.js` — the
 * same instance every registered tool's handler uses), required for
 * per-opportunity write-queue and taint-ledger consistency between the
 * watcher's own writes and any concurrent tool-driven write.
 *
 * Deliberately a separate call from `createServer()`/`startServer()` (see
 * the note on `createServer()` above) — the real entrypoint (`src/index.ts`)
 * calls this alongside `createServer()`/`startServer()` and is responsible
 * for closing the returned handle on process shutdown.
 */
export async function startInboundWatcher(debounceMs?: number): Promise<InboundWatcher> {
  return createInboundWatcherForServer(debounceMs);
}
