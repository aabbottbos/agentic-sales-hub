import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "skills",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
