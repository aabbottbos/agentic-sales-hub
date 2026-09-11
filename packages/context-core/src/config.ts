import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** The `ash.config.json` shape, fully typed even though only `contextRoot` is consumed today. */
export interface AshConfig {
  contextRoot: string;
  org?: { slug: string };
  compile?: { skillOverridesMaxChars: number };
}

export const DEFAULT_ASH_CONFIG: AshConfig = {
  contextRoot: "./context",
  compile: { skillOverridesMaxChars: 2000 },
};

/**
 * Reads `ash.config.json` at `cwd` and returns its `contextRoot` field, if present and a
 * string. Missing file, malformed JSON, or a missing/non-string `contextRoot` all fall
 * through to `undefined` — this is a resolution function, not a validator.
 */
function readConfigContextRoot(cwd: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, "ash.config.json"), "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;
  const contextRoot = (parsed as Record<string, unknown>).contextRoot;
  return typeof contextRoot === "string" ? contextRoot : undefined;
}

/**
 * Resolves the context root directory, always as an absolute path.
 *
 * Precedence: `opts.root` → `ASH_CONTEXT_ROOT` env var → `ash.config.json`'s `contextRoot`
 * field (resolved relative to `cwd`) → `./context` (resolved relative to `cwd`).
 *
 * Synchronous — called at the top of `createLoader()` before other async work. Must be
 * called unconditionally with `opts.root` possibly `undefined`; this function's own
 * precedence chain treats `undefined` as "not explicitly passed" and falls through.
 */
export function resolveContextRoot(opts?: { root?: string; cwd?: string }): string {
  const cwd = opts?.cwd ?? process.cwd();

  const candidate =
    opts?.root ?? process.env.ASH_CONTEXT_ROOT ?? readConfigContextRoot(cwd) ?? "./context";

  return isAbsolute(candidate) ? candidate : resolve(cwd, candidate);
}
