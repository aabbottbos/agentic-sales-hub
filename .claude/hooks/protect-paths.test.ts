import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const protectHook = join(repoRoot, ".claude/hooks/protect-paths.ts");

const OPP = "006Ax0000GkLmNpQAA";

function runHook(payload: unknown): { code: number; stderr: string } {
  const res = spawnSync("pnpm", ["--silent", "exec", "tsx", protectHook], {
    input: JSON.stringify(payload),
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { code: res.status ?? -1, stderr: res.stderr ?? "" };
}

describe("protect-paths hook — artifacts/ write protection", () => {
  it("blocks a direct Write to context/accounts/*/opportunities/*/artifacts/*.md", () => {
    const { code, stderr } = runHook({
      tool_name: "Write",
      tool_input: {
        file_path: `context/accounts/acme-logistics/opportunities/${OPP}/artifacts/2026-09-11-call-prep.md`,
        content: "x",
      },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/writeArtifact|artifacts/i);
  });

  it("blocks a direct Edit to examples/demo-corpus/accounts/*/opportunities/*/artifacts/*.md (dual-root)", () => {
    const { code, stderr } = runHook({
      tool_name: "Edit",
      tool_input: {
        file_path: `examples/demo-corpus/accounts/acme-logistics/opportunities/${OPP}/artifacts/2026-09-11-call-prep.md`,
        old_string: "a",
        new_string: "b",
      },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/writeArtifact|artifacts/i);
  });

  it("allows a Write to meetings/** (control case — the new pattern is scoped to artifacts/ only)", () => {
    const { code } = runHook({
      tool_name: "Write",
      tool_input: {
        file_path: `context/accounts/acme-logistics/opportunities/${OPP}/meetings/2026-09-11-discovery.md`,
        content: "x",
      },
    });
    expect(code).toBe(0);
  });

  it("blocks a direct MultiEdit to an artifacts/ file (both roots share the same rule)", () => {
    const { code, stderr } = runHook({
      tool_name: "MultiEdit",
      tool_input: {
        file_path: `examples/demo-corpus/accounts/meridian-grid/opportunities/${OPP}/artifacts/2026-09-11-proposal-draft.md`,
        edits: [{ old_string: "a", new_string: "b" }],
      },
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/writeArtifact|artifacts/i);
  });

  it("allows a Write under inbound/** (proves the regex doesn't over-match the opportunity subtree)", () => {
    const { code } = runHook({
      tool_name: "Write",
      tool_input: {
        file_path: `context/accounts/acme-logistics/opportunities/${OPP}/inbound/2026-09-11-note.md`,
        content: "x",
      },
    });
    expect(code).toBe(0);
  });
});
