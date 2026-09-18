#!/usr/bin/env node
import { createServer, startServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  await startServer(server);
}

main().catch((error: unknown) => {
  console.error("agentic-sales-hub-mcp failed to start:", error);
  process.exitCode = 1;
});
