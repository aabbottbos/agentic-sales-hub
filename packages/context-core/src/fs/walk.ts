import { glob } from "tinyglobby";

/**
 * List every context file under `contextRoot` (a `context/` directory), as
 * repo-relative posix paths. Excludes the schema dir. Includes `.md` files and
 * `outcomes.jsonl`.
 *
 * `repoRoot` is the directory `context/` sits in; returned paths are relative to
 * it (e.g. `context/org/company.md`).
 */
export async function walkContext(repoRoot: string): Promise<string[]> {
  const matches = await glob(["context/**/*.md", "context/**/outcomes.jsonl"], {
    cwd: repoRoot,
    onlyFiles: true,
    dot: false,
    ignore: ["context/schema/**"],
  });
  return matches.map((m) => m.replaceAll("\\", "/")).sort();
}
