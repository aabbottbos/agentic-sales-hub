import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "evals",
    environment: "node",
    include: ["runner/**/*.test.ts", "scorers/**/*.test.ts"],
  },
});
