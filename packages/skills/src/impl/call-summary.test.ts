import { describe, expect, it } from "vitest";
import { complete, type CompleteArgs } from "./llm.js";

describe("llm seam", () => {
  it("exports complete() with the documented signature", () => {
    expect(typeof complete).toBe("function");
    // shape check only — real calls are integration-tested behind ANTHROPIC_API_KEY
    const args: CompleteArgs = {
      system: "s",
      user: "u",
      model: "claude-sonnet-5",
      maxTokens: 10,
    };
    expect(args.model).toBe("claude-sonnet-5");
  });
});
