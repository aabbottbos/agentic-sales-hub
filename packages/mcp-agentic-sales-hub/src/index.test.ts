import { describe, expect, it } from "vitest";

describe("index.ts entrypoint guard", () => {
  it("importing the module does not start a real server or hang the process", async () => {
    // Under vitest, process.argv[1] is the test runner's own entry, not this
    // file — `import.meta.url === file://${process.argv[1]}` is false, so
    // `main()` must never run as a side effect of this import. This is the
    // gap the Task 10 reviewer flagged: evals/ (plan 005 Task 11) is the
    // first real cross-package consumer to import this module from outside
    // the package, and nothing had exercised the guard until now.
    //
    // A bare dynamic import is the assertion: if `main()` ran, it would try
    // to connect a StdioServerTransport to this test process's real
    // stdin/stdout and/or start the inbound file watcher against the real
    // repo's context/ tree — either would hang this test (no CI timeout
    // budget for a real `await server.connect(...)` on process stdio) or
    // throw. Resolving at all, promptly, is the proof the guard held.
    const mod = await import("./index.js");

    expect(mod.createInboundWatcher).toBeTypeOf("function");
    expect(mod.FILE_WATCHER_ACTOR).toEqual({ type: "system", id: "file-watcher" });
    expect(mod.registerCallSummaryTool).toBeTypeOf("function");
    expect(mod.getSharedLoader).toBeTypeOf("function");
  });
});
