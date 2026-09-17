#!/usr/bin/env tsx
/**
 * PreToolUse hook: block writes to protected paths and destructive commands
 * against append-only context.
 *
 * Protected from any Write/Edit/MultiEdit:
 *   - context/legal/, examples/demo-corpus/legal/   (canonical, PR-reviewed only)
 *   - evals/golden/                                  (the golden eval set)
 *   - docs/intent/, docs/specs/                       (committed SDLC artifacts are immutable)
 *   - .../opportunities/*\/artifacts/                 (generated artifacts are created ONLY
 *                                                      through writeArtifact(), spec 004 —
 *                                                      never a direct Write/Edit/MultiEdit)
 *
 * Both `context/` and `examples/demo-corpus/` are covered (tenancy seam,
 * WI-1): the demo corpus physically lives at `examples/demo-corpus/`, but a
 * file mistakenly planted under the now-sparse `context/` before
 * `check:context-empty` catches it must still be protected. Belt-and-braces.
 *
 * Blocked Bash: rm / git rm / mv targeting an append-only opportunity subtree
 * under context/accounts or examples/demo-corpus/accounts, or the protected
 * canonical paths.
 *
 * Exit 0 = allow. Exit 2 = block.
 */
function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => res(data));
    if (process.stdin.isTTY) res("");
  });
}

// Artifacts under an opportunity are created ONLY through writeArtifact()
// (spec 004) — never a direct Write/Edit/MultiEdit. Matches both roots
// (tenancy seam, WI-1): the logical context/ root and examples/demo-corpus/.
const ARTIFACTS_DIR =
  /(?:^context|^examples\/demo-corpus)\/accounts\/[^/]+\/opportunities\/[^/]+\/artifacts\//;

const PROTECTED_WRITE = [
  /^context\/legal\//,
  /^examples\/demo-corpus\/legal\//,
  /^evals\/golden\//,
  /^docs\/intent\//,
  /^docs\/specs\//,
  ARTIFACTS_DIR,
];

const APPEND_ONLY = /(?:context|examples\/demo-corpus)\/accounts\/[^/]+\/opportunities\//;

function block(reason: string): never {
  process.stderr.write(`BLOCKED (protect-paths): ${reason}\n`);
  process.exit(2);
}

interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);
  let hook: HookInput;
  try {
    hook = JSON.parse(raw) as HookInput;
  } catch {
    process.exit(0);
  }
  const tool = hook.tool_name ?? "";
  const input = hook.tool_input ?? {};

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const fp = String(input.file_path ?? "")
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    if (ARTIFACTS_DIR.test(fp)) {
      block(
        `${fp} is under an opportunity's artifacts/ — generated artifacts are created ONLY ` +
          `through writeArtifact() (spec 004), never a direct Write/Edit/MultiEdit.`,
      );
    }
    if (PROTECTED_WRITE.some((re) => re.test(fp))) {
      block(
        `${fp} is a protected path (canonical context / golden evals / committed SDLC ` +
          `artifact). It changes only through a reviewed PR — CLAUDE.md invariant.`,
      );
    }
  }

  if (tool === "Bash") {
    const cmd = String(input.command ?? "");
    // Only inspect a leading rm / git rm / mv invocation and its bare arguments,
    // not paths that merely appear inside a quoted string (e.g. a commit message).
    const destructive = cmd.match(/^\s*(?:sudo\s+)?(rm|git\s+rm|mv)\s+([^|;&"]*)/);
    if (destructive) {
      const args = destructive[2] ?? "";
      if (APPEND_ONLY.test(args)) {
        block(
          `command targets append-only context under an opportunity: ${cmd.slice(0, 120)} — ` +
            `nothing under an opportunity subtree is deleted or moved (CLAUDE.md invariant 3).`,
        );
      }
      if (
        /context\/legal\//.test(args) ||
        /examples\/demo-corpus\/legal\//.test(args) ||
        /evals\/golden\//.test(args)
      ) {
        block(`command targets a protected path: ${cmd.slice(0, 120)}`);
      }
    }
  }

  process.exit(0);
}

await main();
