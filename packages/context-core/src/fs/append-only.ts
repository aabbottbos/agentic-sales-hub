import { AppendOnlyViolationError } from "../errors.js";
import type { WriteOp } from "../types.js";

const ACCUMULATING_RE = /^context\/accounts\/[^/]+\/opportunities\/[^/]+\//;
const IMMUTABLE_SUBTREES = [/\/meetings\//, /\/inbound\//];
const OUTCOMES_RE = /\/outcomes\.jsonl$/;
const ARTIFACTS_RE = /\/artifacts\//;

export interface FrontmatterDelta {
  /** Keys whose value changed, added, or removed between the old and new file. */
  changedKeys: string[];
  /** New value of `superseded`, if present in the new frontmatter. */
  newSuperseded?: unknown;
  /** Old value of `superseded`, if present in the old frontmatter. */
  oldSuperseded?: unknown;
}

/**
 * Enforce the append-only rule for accumulating context
 * (`context/accounts/<slug>/opportunities/<id>/...`):
 *
 * - `delete` on anything under an opportunity is always rejected.
 * - `modify` under `meetings/**` or `inbound/**`, or of `outcomes.jsonl`, is rejected.
 *   (An `outcomes.jsonl` append is modeled as `create` + a controlled appender.)
 * - `modify` under `artifacts/**` is allowed ONLY when the sole frontmatter change
 *   is `superseded: false -> true`. `delta` must be supplied for that check.
 * - `create` is always allowed.
 *
 * Canonical context (org, legal, demand-gen) is not gated here — it is versioned
 * through PR review, with a protect-paths hook as the enforcement layer for
 * `context/legal/**`.
 */
export function assertAppendOnly(repoRelPath: string, op: WriteOp, delta?: FrontmatterDelta): void {
  const path = repoRelPath.replaceAll("\\", "/");
  if (!ACCUMULATING_RE.test(path)) {
    return; // not accumulating context; nothing to enforce here
  }

  if (op === "delete") {
    throw new AppendOnlyViolationError(
      path,
      op,
      "nothing under an opportunity may be deleted; supersede instead",
    );
  }

  if (op === "create") {
    return;
  }

  // op === "modify"
  if (IMMUTABLE_SUBTREES.some((re) => re.test(path)) || OUTCOMES_RE.test(path)) {
    throw new AppendOnlyViolationError(
      path,
      op,
      "meeting notes, inbound documents, and outcomes.jsonl are never rewritten",
    );
  }

  if (ARTIFACTS_RE.test(path)) {
    if (!delta) {
      throw new AppendOnlyViolationError(
        path,
        op,
        "modifying an artifact requires a frontmatter delta; only superseded: false -> true is allowed",
      );
    }
    const onlySupersededChanged =
      delta.changedKeys.length === 1 && delta.changedKeys[0] === "superseded";
    const flippedToTrue = delta.oldSuperseded !== true && delta.newSuperseded === true;
    if (!onlySupersededChanged || !flippedToTrue) {
      throw new AppendOnlyViolationError(
        path,
        op,
        "the only permitted artifact modification is flipping superseded from false to true",
      );
    }
    return;
  }

  // Any other accumulating file (account.md, people/*, opportunity.md): treat as
  // immutable in Phase 0 — these are established once. Reject modify.
  throw new AppendOnlyViolationError(
    path,
    op,
    "accumulating context under an opportunity is append-only",
  );
}

/** Compute a FrontmatterDelta from two parsed frontmatter objects. */
export function frontmatterDelta(
  oldFm: Record<string, unknown>,
  newFm: Record<string, unknown>,
): FrontmatterDelta {
  const keys = new Set([...Object.keys(oldFm), ...Object.keys(newFm)]);
  const changedKeys: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(oldFm[k]) !== JSON.stringify(newFm[k])) {
      changedKeys.push(k);
    }
  }
  const delta: FrontmatterDelta = { changedKeys };
  if ("superseded" in newFm) delta.newSuperseded = newFm.superseded;
  if ("superseded" in oldFm) delta.oldSuperseded = oldFm.superseded;
  return delta;
}
