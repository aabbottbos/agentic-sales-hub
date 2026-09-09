#!/usr/bin/env tsx
/**
 * PreToolUse hook: block any tool call whose arguments contain text derived from
 * a quarantined `inbound/**` document that has been ingested this session.
 *
 * Reads the tool-call JSON on stdin: `{ tool_name, tool_input, cwd }`.
 * Exit 0 = allow. Exit 2 = block (stderr carries the reason).
 *
 * Detection is against the taint ledger that `@agentic-sales-hub/context-core` writes
 * every time `readInbound` runs — see packages/context-core/src/quarantine/taint.ts.
 * The threat model is "content the agent already ingested flowing back out."
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
// Imported from source (not the package name) — .claude/hooks is not a workspace member.
import { createTaintLedger } from "../../packages/context-core/src/index.js";

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => res(data));
    if (process.stdin.isTTY) res("");
  });
}

/** Collect the argument strings worth checking for a given tool. */
function candidateStrings(tool: string, input: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };
  switch (tool) {
    case "Write":
    case "Edit":
    case "MultiEdit":
      push(input.content);
      push(input.new_string);
      push(input.file_path);
      if (Array.isArray(input.edits)) {
        for (const e of input.edits as Array<Record<string, unknown>>) push(e.new_string);
      }
      break;
    case "Bash":
      push(input.command);
      break;
    default:
      for (const v of Object.values(input)) push(v);
  }
  return out;
}

function block(reason: string): never {
  process.stderr.write(`BLOCKED (quarantine-inbound): ${reason}\n`);
  process.exit(2);
}

async function main(): Promise<void> {
  const root = repoRoot();
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  let hook: HookInput;
  try {
    hook = JSON.parse(raw) as HookInput;
  } catch {
    process.exit(0); // not our payload shape; don't interfere
  }

  const tool = hook.tool_name ?? "";
  const input = hook.tool_input ?? {};
  // ASH_TAINT_LEDGER lets the eval injection-harness point the hook at the
  // same ledger it populated. Defaults to the session ledger.
  const ledgerPath = process.env.ASH_TAINT_LEDGER ?? join(root, ".claude/.taint-ledger.jsonl");
  const ledger = createTaintLedger(ledgerPath);

  const candidates = candidateStrings(tool, input);
  for (const value of candidates) {
    const match = await ledger.match(value);
    if (match) {
      block(
        `tool call ${tool} carries an argument derived from quarantined content ` +
          `(source: ${match.sourcePath}). inbound/** content may not flow into tool call ` +
          `arguments. See spec §9.`,
      );
    }
  }

  // Extra guard: a Write/Edit whose target is under context/** and whose content
  // carries ANY taint shingle — the exact shape of the corpus injection.
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  if (filePath) {
    const abs = resolve(root, filePath);
    if (
      abs.startsWith(join(root, "context")) ||
      filePath.replaceAll("\\", "/").startsWith("context/")
    ) {
      const content = typeof input.content === "string" ? input.content : "";
      const match = content ? await ledger.match(content) : null;
      if (match) {
        block(
          `write to ${filePath} carries quarantined content (source: ${match.sourcePath}). ` +
            `A counterparty document must never be written into context/.`,
        );
      }
    }
  }

  process.exit(0);
}

await main();
