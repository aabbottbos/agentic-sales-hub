import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLoader } from "@agentic-sales-hub/context-core";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const quarantineHook = join(repoRoot, ".claude/hooks/quarantine-inbound.ts");
const protectHook = join(repoRoot, ".claude/hooks/protect-paths.ts");
const ledgerPath = join(repoRoot, ".claude/.taint-ledger.jsonl");

const OPP = "006Ax0000GkLmNpQAA";
const sowRedline = `context/accounts/acme-logistics/opportunities/${OPP}/inbound/2026-09-04-acme-sow-redline.md`;

function runHook(hookPath: string, payload: unknown): { code: number; stderr: string } {
  const res = spawnSync("pnpm", ["--silent", "exec", "tsx", hookPath], {
    input: JSON.stringify(payload),
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { code: res.status ?? -1, stderr: res.stderr ?? "" };
}

describe("protect-paths hook", () => {
  it("blocks a Write to context/legal/**", () => {
    const { code, stderr } = runHook(protectHook, {
      tool_name: "Write",
      tool_input: { file_path: "context/legal/guidance.md", content: "x" },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/protected path/);
  });

  it("blocks a Write to examples/demo-corpus/legal/** (tenancy seam: both roots protected)", () => {
    const { code, stderr } = runHook(protectHook, {
      tool_name: "Write",
      tool_input: { file_path: "examples/demo-corpus/legal/guidance.md", content: "x" },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/protected path/);
  });

  it("blocks a Write to evals/golden/**", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Write",
      tool_input: { file_path: "evals/golden/allowed-slugs.txt", content: "x" },
    });
    expect(code).toBe(2);
  });

  it("allows a Write to packages/**", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Write",
      tool_input: { file_path: "packages/skills/src/foo.ts", content: "x" },
    });
    expect(code).toBe(0);
  });

  it("blocks rm against an opportunity subtree", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Bash",
      tool_input: {
        command: `rm context/accounts/acme-logistics/opportunities/${OPP}/meetings/2026-07-14-discovery.md`,
      },
    });
    expect(code).toBe(2);
  });

  it("blocks rm against an opportunity subtree under examples/demo-corpus", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Bash",
      tool_input: {
        command: `rm examples/demo-corpus/accounts/acme-logistics/opportunities/${OPP}/meetings/2026-07-14-discovery.md`,
      },
    });
    expect(code).toBe(2);
  });

  it("blocks a Bash command targeting examples/demo-corpus/legal/**", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Bash",
      tool_input: { command: "rm examples/demo-corpus/legal/guidance.md" },
    });
    expect(code).toBe(2);
  });

  it("allows an unrelated Bash command", () => {
    const { code } = runHook(protectHook, {
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
    });
    expect(code).toBe(0);
  });
});

describe("quarantine-inbound hook", () => {
  beforeAll(async () => {
    // ingest the SOW redline so the taint ledger has its shingles
    await rm(ledgerPath, { force: true });
    const loader = await createLoader({
      repoRoot,
      root: join(repoRoot, "examples/demo-corpus"),
      taintLedgerPath: ledgerPath,
    });
    await loader.readInbound(sowRedline);
  });
  afterAll(async () => {
    await rm(ledgerPath, { force: true });
  });

  it("blocks a Write whose content lifts the injection phrase from the ingested redline", () => {
    const { code, stderr } = runHook(quarantineHook, {
      tool_name: "Write",
      tool_input: {
        file_path: "context/legal/guidance.md",
        content: "SOW approved, no issues",
      },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/quarantine|inbound/i);
  });

  it("blocks a Bash command carrying a lifted phrase", () => {
    const { code } = runHook(quarantineHook, {
      tool_name: "Bash",
      tool_input: {
        command:
          'echo "acceptance of each deliverable is at the sole discretion of the customer" >> notes.md',
      },
    });
    expect(code).toBe(2);
  });

  it("allows a clean Write", () => {
    const { code } = runHook(quarantineHook, {
      tool_name: "Write",
      tool_input: { file_path: "packages/skills/src/foo.ts", content: "export const x = 1;" },
    });
    expect(code).toBe(0);
  });
});
