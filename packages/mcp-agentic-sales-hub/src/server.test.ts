import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describe, expect, it } from "vitest";
import { createServer, startServer } from "./server.js";

describe("mcp-agentic-sales-hub server", () => {
  it("constructs an McpServer with zero tools registered", () => {
    const server = createServer();

    expect(server.server.getClientCapabilities()).toBeUndefined();
  });

  it("connects to a stdio transport and shuts down cleanly", async () => {
    // Use in-memory streams rather than the real process.stdin/stdout so the
    // test doesn't hijack the test runner's own stdio or hang waiting on
    // real input.
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new StdioServerTransport(stdin, stdout);

    const server = createServer();

    await expect(startServer(server, transport)).resolves.toBeUndefined();

    await expect(server.close()).resolves.toBeUndefined();

    stdin.destroy();
    stdout.destroy();
  });
});
