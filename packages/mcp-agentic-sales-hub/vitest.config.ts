import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "mcp-agentic-sales-hub",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
