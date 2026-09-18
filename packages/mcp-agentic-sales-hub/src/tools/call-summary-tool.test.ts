import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSchemas, readContextFile, resolveContextPath } from "@agentic-sales-hub/context-core";
// call-summary is LLM-backed. Stub the model call the same way
// packages/mcp-agentic-sales-hub/src/tools/call-prep-tool.test.ts does — via
// the sibling package's build output, so spying here affects the real call
// `runSkill` (via the tool handler) makes.
import * as llm from "../../../skills/dist/impl/llm.js";
import { createServer } from "../server.js";
import { registerCallSummaryTool } from "./call-summary-tool.js";
import { getSharedLoader, resetSharedLoaderForTests } from "./shared.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const ACCOUNT = "acme-logistics";
const OPP = "006Ax0000GkLmNpQAA";
const DISCOVERY_NOTE = `context/accounts/${ACCOUNT}/opportunities/${OPP}/meetings/2026-07-14-discovery.md`;
const MSA_REDLINE = `context/accounts/${ACCOUNT}/opportunities/${OPP}/inbound/2026-09-02-acme-msa-redline.md`;

async function scratchCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-mcp-call-summary-"));
  const root = join(tmpDir, "demo-corpus");
  await cp(join(repoRoot, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
}

type Handler = (
  args: { actor: { type: "human" | "system"; id: string }; meeting_path: string },
  extra: unknown,
) => Promise<{ content: { type: string; text: string }[] }>;

describe("call-summary MCP tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSharedLoaderForTests();
    delete process.env.ASH_CONTEXT_ROOT;
    delete process.env.ASH_TAINT_LEDGER_PATH;
  });

  it("threads the given actor into the persisted artifact, kind: summary", async () => {
    const { tmpDir, root } = await scratchCorpus();
    try {
      process.env.ASH_CONTEXT_ROOT = root;
      process.env.ASH_TAINT_LEDGER_PATH = join(tmpDir, ".taint-ledger.jsonl");
      resetSharedLoaderForTests();

      const discoveryRaw = (
        await readFile(resolveContextPath(DISCOVERY_NOTE, root), "utf8")
      ).replace(/\r\n/g, "\n");
      const quote = discoveryRaw.slice(0, 40).trim();

      const stub = JSON.stringify({
        summary: "Discovery call with Acme Logistics about a single exception queue.",
        commitments: [
          {
            text: "Send the Midwest Freight case study",
            owner: "us",
            citation: { path: DISCOVERY_NOTE, quote },
          },
        ],
        next_steps: [],
        context_deltas: [],
        citations: [{ path: DISCOVERY_NOTE, quote }],
        unsourced_claims: [],
      });
      vi.spyOn(llm, "complete").mockResolvedValue(stub);

      const server = new McpServer({ name: "test", version: "0.0.0" });
      const tool = registerCallSummaryTool(server);

      const actor = { type: "human" as const, id: "aabbott@gmail.com" };

      const callToolResult = await (tool.handler as Handler)(
        { actor, meeting_path: DISCOVERY_NOTE },
        {},
      );

      const parsed = JSON.parse(callToolResult.content[0].text) as { artifactPath?: string };
      expect(parsed.artifactPath).toBeDefined();

      const registry = await loadSchemas(join(repoRoot, "context/schema"));
      const persisted = await readContextFile(parsed.artifactPath as string, { root, registry });

      expect(persisted.frontmatter.kind).toBe("summary");
      expect(persisted.frontmatter.generated_by).toBe("call-summary");
      expect(persisted.frontmatter.actor).toEqual({ type: "human", id: "aabbott@gmail.com" });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to persist when the rendered body contains tainted (quarantined) content", async () => {
    const { tmpDir, root } = await scratchCorpus();
    try {
      process.env.ASH_CONTEXT_ROOT = root;
      process.env.ASH_TAINT_LEDGER_PATH = join(tmpDir, ".taint-ledger.jsonl");
      resetSharedLoaderForTests();

      // Draw a genuine multi-word phrase out of the actual inbound document
      // via the sanctioned readInbound()+extractUntrusted() path — this both
      // registers the document's 8-word shingles in the taint ledger
      // (readInbound's job) and gives us real content to "leak" into the
      // stubbed model output below, rather than a guessed string. Taking
      // (past the heading, to avoid stripped punctuation shifting word
      // counts) 8 raw words normalizes to >= 8 words, so it fully contains
      // one of the ledger's 8-word shingles verbatim — the match survives
      // being embedded inside surrounding prose (as below), unlike the
      // ledger's shorter "lifted phrase" path, which only looks at a
      // checked value's OWN total word count (3-7), not a substring of it.
      const loader = await getSharedLoader();
      const { wrapped } = await loader.readInbound(MSA_REDLINE);
      const noteBody = loader.extractUntrusted(wrapped);
      const words = noteBody.split(/\s+/).filter(Boolean);
      const leaked = words.slice(10, 18).join(" ");
      expect(leaked.split(" ").length).toBeGreaterThanOrEqual(3);

      // Sanity: the leaked phrase is now tainted.
      expect(await loader.isTainted(leaked)).not.toBeNull();

      // Stub a summary whose prose verbatim-includes the leaked phrase — the
      // prompt-injection outcome this check exists to catch.
      const stub = JSON.stringify({
        summary: `Notes from the counterparty: ${leaked}.`,
        commitments: [],
        next_steps: [],
        context_deltas: [],
        citations: [],
        unsourced_claims: [],
      });
      vi.spyOn(llm, "complete").mockResolvedValue(stub);

      const writeArtifactSpy = vi.spyOn(loader, "writeArtifact");

      const server = new McpServer({ name: "test", version: "0.0.0" });
      const tool = registerCallSummaryTool(server);
      const actor = { type: "system" as const, id: "file-watcher" };

      await expect(
        (tool.handler as Handler)({ actor, meeting_path: MSA_REDLINE }, {}),
      ).rejects.toThrow(/tainted|quarantined/i);

      expect(writeArtifactSpy).not.toHaveBeenCalled();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("registering the call-summary tool does not break server construction", () => {
    expect(() => createServer()).not.toThrow();
  });
});
