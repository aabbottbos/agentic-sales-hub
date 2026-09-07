import type { Mutability } from "../types.js";

export interface Classification {
  schemaType: string;
  mutability: Mutability;
  /** True for inbound documents (counterparty-supplied, quarantined). */
  quarantined: boolean;
}

/** Ordered path patterns -> schema type. First match wins. */
const RULES: Array<{
  re: RegExp;
  schemaType: string;
  mutability: Mutability;
  quarantined?: boolean;
}> = [
  { re: /^context\/org\/company\.md$/, schemaType: "org-company", mutability: "canonical" },
  {
    re: /^context\/org\/offerings\/[^/]+\.md$/,
    schemaType: "org-offering",
    mutability: "canonical",
  },
  { re: /^context\/org\/pricing\.md$/, schemaType: "pricing", mutability: "canonical" },
  { re: /^context\/org\/evidence\/[^/]+\.md$/, schemaType: "evidence", mutability: "canonical" },
  {
    re: /^context\/demand-gen\/icp\/account\.md$/,
    schemaType: "icp-account",
    mutability: "canonical",
  },
  {
    re: /^context\/demand-gen\/icp\/buyer\.md$/,
    schemaType: "icp-buyer",
    mutability: "canonical",
  },
  {
    re: /^context\/legal\/guidance\.md$/,
    schemaType: "legal-guidance",
    mutability: "canonical",
  },
  {
    re: /^context\/legal\/clause-library\/[^/]+\.md$/,
    schemaType: "clause",
    mutability: "canonical",
  },
  {
    re: /^context\/accounts\/[^/]+\/account\.md$/,
    schemaType: "account",
    mutability: "accumulating",
  },
  {
    re: /^context\/accounts\/[^/]+\/people\/[^/]+\.md$/,
    schemaType: "person",
    mutability: "accumulating",
  },
  {
    re: /^context\/accounts\/[^/]+\/opportunities\/[^/]+\/opportunity\.md$/,
    schemaType: "opportunity",
    mutability: "accumulating",
  },
  {
    re: /^context\/accounts\/[^/]+\/opportunities\/[^/]+\/meetings\/[^/]+\.md$/,
    schemaType: "meeting",
    mutability: "accumulating",
  },
  {
    re: /^context\/accounts\/[^/]+\/opportunities\/[^/]+\/artifacts\/[^/]+\.md$/,
    schemaType: "artifact",
    mutability: "accumulating",
  },
  {
    re: /^context\/accounts\/[^/]+\/opportunities\/[^/]+\/inbound\/[^/]+\.md$/,
    schemaType: "inbound",
    mutability: "accumulating",
    quarantined: true,
  },
];

/**
 * Classify a repo-relative posix path to its schema type and mutability class.
 * Returns null for a path that does not match any known context-file location
 * (the caller treats an unclassifiable `context/**` markdown file as an error).
 *
 * `outcomes.jsonl` is intentionally not classified here — its lines validate
 * against `outcome` and are handled by the outcomes reader, not the file reader.
 */
export function classify(repoRelPath: string): Classification | null {
  const path = repoRelPath.replaceAll("\\", "/");
  for (const rule of RULES) {
    if (rule.re.test(path)) {
      return {
        schemaType: rule.schemaType,
        mutability: rule.mutability,
        quarantined: rule.quarantined ?? false,
      };
    }
  }
  return null;
}

/** True if the path is somewhere under `context/` (excluding the schema dir). */
export function isContextFile(repoRelPath: string): boolean {
  const path = repoRelPath.replaceAll("\\", "/");
  return path.startsWith("context/") && !path.startsWith("context/schema/");
}
