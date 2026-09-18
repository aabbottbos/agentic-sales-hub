import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Package version is not read from package.json at runtime (no JSON import
 * assertions in this build target); keep this literal in sync with
 * package.json's "version" field.
 */
const SERVER_VERSION = "0.0.0";

/**
 * Builds the Agentic Sales Hub MCP server.
 *
 * Zero tools are registered yet — this is scaffolding only (plan 005, Task 7).
 * Tasks 8-9 add `call-prep`/`call-summary` as MCP tools; Task 10 adds the
 * inbound file watcher. None of that logic lives here yet.
 */
export function createServer(): McpServer {
  return new McpServer({
    name: "agentic-sales-hub",
    version: SERVER_VERSION,
  });
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
