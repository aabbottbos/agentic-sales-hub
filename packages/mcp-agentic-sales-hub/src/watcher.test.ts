import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLoader,
  resolveContextPath,
  sha256,
  type ContextLoader,
} from "@agentic-sales-hub/context-core";
// call-summary is LLM-backed. Stub the model call the same way
// packages/mcp-agentic-sales-hub/src/tools/call-summary-tool.test.ts does —
// via the sibling package's build output, so spying here affects the real
// call `runSkill` (through the watcher's pipeline) makes.
import * as llm from "../../skills/dist/impl/llm.js";
import { createInboundWatcher, FILE_WATCHER_ACTOR, type InboundWatcher } from "./watcher.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const ACCOUNT = "acme-logistics";
const OPP = "006Ax0000GkLmNpQAA";
const OPP_DIR = `context/accounts/${ACCOUNT}/opportunities/${OPP}`;

// Short debounce for tests — real short timers rather than fake timers,
// since fs.watch's events are real, unmockable filesystem I/O; a small
// override keeps each test fast without fighting fake-timer/real-I/O
// interaction. 200ms (not the plan's ~400ms default, but comfortably above
// it) rather than something tighter: measured directly on this platform,
// repeated rapid writes to the same path can produce two raw fs.watch
// "rename" events roughly ~50ms apart even though the writes themselves
// finish faster than that (macOS's underlying kqueue coalescing appears to
// batch and re-fire on its own ~50ms cadence) — a debounce at or near that
// same interval can itself get re-triggered by the second raw event,
// defeating the coalescing this test exists to prove. 200ms clears that
// with margin while staying fast for a test.
const TEST_DEBOUNCE_MS = 200;
// Generous settle margin beyond the debounce window itself, to absorb
// fs.watch's own event-delivery latency (real I/O, not instantaneous) before
// asserting on the outcome of a triggered run.
const SETTLE_MARGIN_MS = 650;

async function scratchCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-watcher-"));
  // The watcher hardcodes join(repoRoot, "context") per the plan, so the
  // scratch corpus (which IS the context root — examples/demo-corpus has no
  // "context/" subdirectory of its own) must live at exactly
  // <tmpDir>/context for the watched directory and the loader's own root to
  // be the same tree.
  const root = join(tmpDir, "context");
  const { cp } = await import("node:fs/promises");
  await cp(join(repoRoot, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
}

function stubSummary(overrides: { summary?: string } = {}): string {
  return JSON.stringify({
    summary:
      overrides.summary ?? "Discovery call with Acme Logistics about a single exception queue.",
    commitments: [],
    next_steps: [],
    context_deltas: [],
    citations: [],
    unsourced_claims: [],
  });
}

/**
 * Writes a brand-new, correctly-hashed inbound fixture file — rather than
 * mutating one of the corpus's existing inbound documents, which would
 * invalidate its declared `source_hash` (sha256 of the LF-normalized body,
 * verified on every `readInbound()` call) and make every trigger fail before
 * the watcher's pipeline even gets to the taint check this test suite cares
 * about.
 */
function inboundFixtureContent(body: string): string {
  const bodyHash = sha256(body);
  const frontmatter = [
    "---",
    "fictional: true",
    "mutability: accumulating",
    'schema_version: "1.1.0"',
    'created: "2026-09-18T00:00:00Z"',
    "title: Watcher test fixture",
    `source_hash: ${bodyHash}`,
    "quarantined: true",
    'received: "2026-09-18"',
    "doc_type: other",
    "counterparty: Acme Logistics",
    "---",
    "",
  ].join("\n");
  return frontmatter + body;
}

async function writeInboundFixture(root: string, logicalPath: string, body: string): Promise<void> {
  const absPath = resolveContextPath(logicalPath, root);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, inboundFixtureContent(body));
}

describe("createInboundWatcher", () => {
  const cleanups: (() => Promise<void> | void)[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  async function setup(): Promise<{
    tmpDir: string;
    root: string;
    loader: ContextLoader;
    watcher: InboundWatcher;
  }> {
    const { tmpDir, root } = await scratchCorpus();
    const loader = await createLoader({
      repoRoot: tmpDir,
      root,
      schemaDir: join(repoRoot, "context/schema"),
      taintLedgerPath: join(tmpDir, ".taint-ledger.jsonl"),
    });
    const watcher = createInboundWatcher({
      loader,
      repoRoot: tmpDir,
      debounceMs: TEST_DEBOUNCE_MS,
    });
    cleanups.push(async () => {
      watcher.close();
      await rm(tmpDir, { recursive: true, force: true });
    });
    return { tmpDir, root, loader, watcher };
  }

  it("coalesces a burst of rapid writes to the same inbound path into exactly one processing run", async () => {
    const { root, loader } = await setup();
    vi.spyOn(llm, "complete").mockResolvedValue(stubSummary());
    const writeArtifactSpy = vi.spyOn(loader, "writeArtifact");

    const logicalPath = `${OPP_DIR}/inbound/2026-09-18-burst-test.md`;

    // Pre-create the directory once, outside the timed burst below — mkdir's
    // own fs events (unrelated to the target FILE path) would otherwise mix
    // into the burst's timing on the first iteration.
    await mkdir(dirname(resolveContextPath(logicalPath, root)), { recursive: true });

    // Multiple rapid writes to the same path, all within one debounce
    // window — simulates the temp-file-then-rename / multi-flush burst
    // fs.watch can produce for what is conceptually one "file appeared"
    // occurrence. Kept well inside TEST_DEBOUNCE_MS (each subsequent write
    // resets that path's timer) so the whole burst coalesces into one run.
    for (let i = 0; i < 5; i++) {
      const body = `Body revision ${i}. Some counterparty text.`;
      await writeFile(resolveContextPath(logicalPath, root), inboundFixtureContent(body));
      await delay(5);
    }

    await delay(TEST_DEBOUNCE_MS + SETTLE_MARGIN_MS);

    expect(writeArtifactSpy).toHaveBeenCalledTimes(1);
  });

  it("silently ignores an event for a non-opportunity-shaped path without crashing", async () => {
    const { root, loader } = await setup();
    vi.spyOn(llm, "complete").mockResolvedValue(stubSummary());
    const writeArtifactSpy = vi.spyOn(loader, "writeArtifact");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // A file directly under context/ that happens to contain "inbound" in its
    // name but is not under an opportunities/<crmId>/inbound/ directory —
    // matches the /inbound/ substring filter loosely but fails
    // parseOpportunityPath's stricter shape check.
    const malformedPath = join(root, "inbound-but-not-opportunity-shaped.md");
    await writeFile(malformedPath, "not shaped like an opportunity inbound doc");

    await delay(TEST_DEBOUNCE_MS + SETTLE_MARGIN_MS);

    expect(writeArtifactSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("persists a triggered artifact attributed to the file-watcher sentinel actor", async () => {
    const { root, loader } = await setup();
    vi.spyOn(llm, "complete").mockResolvedValue(stubSummary());
    const writeArtifactSpy = vi.spyOn(loader, "writeArtifact");

    const logicalPath = `${OPP_DIR}/inbound/2026-09-18-sentinel-test.md`;
    await writeInboundFixture(
      root,
      logicalPath,
      "The counterparty sent over a note about renewal timing and budget.",
    );

    await delay(TEST_DEBOUNCE_MS + SETTLE_MARGIN_MS);

    expect(writeArtifactSpy).toHaveBeenCalledTimes(1);
    const writeArgs = writeArtifactSpy.mock.calls[0]?.[0];
    expect(writeArgs?.kind).toBe("summary");
    expect(writeArgs?.generatedBy).toBe("call-summary");
    expect(writeArgs?.actor).toEqual(FILE_WATCHER_ACTOR);

    const written = writeArtifactSpy.mock.results[0]?.value as
      | Promise<{ artifactPath: string }>
      | undefined;
    const result = await written;
    expect(result?.artifactPath).toBeDefined();

    const persisted = await loader.read(result!.artifactPath);
    expect(persisted.frontmatter.kind).toBe("summary");
    expect(persisted.frontmatter.generated_by).toBe("call-summary");
    expect(persisted.frontmatter.actor).toEqual(FILE_WATCHER_ACTOR);
  });

  it("recovers from a tainted-render refusal: a bad trigger never persists, a subsequent good trigger still does", async () => {
    const { root, loader } = await setup();

    const taintedPath = `${OPP_DIR}/inbound/2026-09-18-tainted-test.md`;
    const taintedBody =
      "Confidential counterparty language about liability caps and indemnification terms that must never leak verbatim into our own artifacts under any circumstances.";
    await writeInboundFixture(root, taintedPath, taintedBody);

    // Draw real content out of the actual inbound document via the
    // sanctioned readInbound()+extractUntrusted() path, mirroring
    // call-summary-tool.test.ts's negative case exactly — this both
    // registers the document's shingles in the taint ledger and gives us
    // real content to "leak" into the stubbed model output below.
    const { wrapped } = await loader.readInbound(taintedPath);
    const noteBody = loader.extractUntrusted(wrapped);
    const words = noteBody.split(/\s+/).filter(Boolean);
    const leaked = words.slice(2, 10).join(" ");
    expect(await loader.isTainted(leaked)).not.toBeNull();

    const writeArtifactSpy = vi.spyOn(loader, "writeArtifact");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // First (bad) trigger: model output verbatim-leaks tainted content. This
    // re-triggers on the SAME file (a second write) — readInbound has
    // already registered its taint above regardless of which write fires it.
    vi.spyOn(llm, "complete").mockResolvedValueOnce(
      stubSummary({ summary: `Notes from the counterparty: ${leaked}.` }),
    );
    await writeInboundFixture(root, taintedPath, taintedBody);

    await delay(TEST_DEBOUNCE_MS + SETTLE_MARGIN_MS);

    expect(writeArtifactSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    // Second (good) trigger on a different, untainted inbound file in the
    // same opportunity — proves the watcher survived the first failure and
    // still processes future events normally.
    vi.spyOn(llm, "complete").mockResolvedValueOnce(stubSummary());
    const cleanPath = `${OPP_DIR}/inbound/2026-09-18-clean-test.md`;
    await writeInboundFixture(root, cleanPath, "An unrelated, untainted counterparty note.");

    await delay(TEST_DEBOUNCE_MS + SETTLE_MARGIN_MS);

    expect(writeArtifactSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
