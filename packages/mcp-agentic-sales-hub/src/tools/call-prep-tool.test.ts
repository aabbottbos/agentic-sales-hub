import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSchemas, readContextFile, resolveContextPath } from "@agentic-sales-hub/context-core";
// call-prep is LLM-backed. Stub the model call the same way
// packages/skills/src/impl/call-prep.test.ts does (`vi.spyOn` on `complete`)
// so this test never requires a live API key. Imported by relative path into
// the sibling package's build output: `@agentic-sales-hub/skills`'s package
// `exports` map only publishes its top-level entrypoint, but `runSkill`'s own
// internal `./llm.js` import resolves to this exact file on disk, so spying
// on it here affects the real call `runSkill` (via the tool handler) makes.
import * as llm from "../../../skills/dist/impl/llm.js";
import { createServer } from "../server.js";
import { registerCallPrepTool } from "./call-prep-tool.js";
import { resetSharedLoaderForTests } from "./shared.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const ACCOUNT = "acme-logistics";
const OPP = "006Ax0000GkLmNpQAA";
const DISCOVERY_NOTE = `context/accounts/${ACCOUNT}/opportunities/${OPP}/meetings/2026-07-14-discovery.md`;

async function scratchCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-mcp-call-prep-"));
  const root = join(tmpDir, "demo-corpus");
  await cp(join(repoRoot, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
}

describe("call-prep MCP tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSharedLoaderForTests();
    delete process.env.ASH_CONTEXT_ROOT;
    delete process.env.ASH_TAINT_LEDGER_PATH;
  });

  it("threads the given actor into the persisted artifact's generated_by/actor fields", async () => {
    const { tmpDir, root } = await scratchCorpus();
    try {
      // getSharedLoader() (shared.ts) constructs its ContextLoader from
      // REPO_ROOT alone, so `resolveContextRoot()` resolves the corpus root
      // from ASH_CONTEXT_ROOT — the same override mechanism
      // packages/context-core/scripts/validate-corpus.ts uses. Pointing it at
      // the scratch copy is what keeps this test from writing into (and
      // requiring append-only compliance against) examples/demo-corpus/
      // itself (mirrors the eval runner's scratchCorpus() precedent, JC9).
      process.env.ASH_CONTEXT_ROOT = root;
      process.env.ASH_TAINT_LEDGER_PATH = join(tmpDir, ".taint-ledger.jsonl");
      resetSharedLoaderForTests();

      const discoveryRaw = (
        await readFile(resolveContextPath(DISCOVERY_NOTE, root), "utf8")
      ).replace(/\r\n/g, "\n");
      const quote = discoveryRaw.slice(0, 40).trim();

      const stub = JSON.stringify({
        goal: "Get IT comfortable with the integration.",
        what_we_know: [{ text: "From discovery", citation: { path: DISCOVERY_NOTE, quote } }],
        talking_points: [],
        risks: [],
        citations: [{ path: DISCOVERY_NOTE, quote }],
        unsourced_claims: [],
      });
      vi.spyOn(llm, "complete").mockResolvedValue(stub);

      const server = new McpServer({ name: "test", version: "0.0.0" });
      const tool = registerCallPrepTool(server);

      const actor = { type: "human" as const, id: "aabbott@gmail.com" };

      type Handler = (
        args: { actor: typeof actor; account_slug: string; opp_id: string },
        extra: unknown,
      ) => Promise<{ content: { type: string; text: string }[] }>;

      const callToolResult = await (tool.handler as Handler)(
        { actor, account_slug: ACCOUNT, opp_id: OPP },
        {},
      );

      const parsed = JSON.parse(callToolResult.content[0].text) as { artifactPath?: string };
      expect(parsed.artifactPath).toBeDefined();

      const registry = await loadSchemas(join(repoRoot, "context/schema"));
      const persisted = await readContextFile(parsed.artifactPath as string, { root, registry });

      expect(persisted.frontmatter.generated_by).toBe("call-prep");
      expect(persisted.frontmatter.actor).toEqual({ type: "human", id: "aabbott@gmail.com" });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("registering the call-prep tool does not break server construction", () => {
    expect(() => createServer()).not.toThrow();
  });
});
