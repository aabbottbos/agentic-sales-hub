import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCallPrepTool } from "./tools/call-prep-tool.js";

/**
 * Package version is not read from package.json at runtime (no JSON import
 * assertions in this build target); keep this literal in sync with
 * package.json's "version" field.
 */
const SERVER_VERSION = "0.0.0";

/**
 * Builds the Agentic Sales Hub MCP server.
 *
 * Registers `call-prep` (plan 005, Task 8). Task 9 adds `call-summary` as an
 * MCP tool; Task 10 adds the inbound file watcher. Neither lives here yet.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "agentic-sales-hub",
    version: SERVER_VERSION,
  });

  registerCallPrepTool(server);

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
