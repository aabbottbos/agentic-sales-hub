/**
 * Per-opportunity write serialization. `ContextLoader.writeArtifact`/`.appendOutcome`
 * route through this so concurrent callers touching the SAME opportunity are
 * serialized, while calls against different opportunities remain fully
 * independent (spec 005 OQ#5). Scoped to one loader instance's lifetime — an
 * accepted limit, not a cross-process lock (matches the spec's own "single
 * in-process mutex" non-goal).
 */

/** The queue key for one opportunity: `${accountSlug}::${crmId}`. */
export function opportunityKey(accountSlug: string, crmId: string): string {
  return `${accountSlug}::${crmId}`;
}

export interface OpportunityQueue {
  /**
   * Run `fn` after every previously-queued call at `key` has settled
   * (resolved or rejected), one at a time, in call order. Different keys
   * never block each other. The returned promise resolves/rejects with
   * `fn`'s own outcome; a rejection here does not affect subsequent calls
   * queued at the same key — the internal chain always continues.
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/** Build a fresh, empty per-opportunity queue. */
export function createOpportunityQueue(): OpportunityQueue {
  // Tracks the tail of each key's chain. The tracked promise is intentionally
  // typed to always settle successfully (never a rejection) — see below —
  // so that appending `.then(fn)` to it never short-circuits past `fn`.
  const tails = new Map<string, Promise<void>>();

  function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previousTail = tails.get(key) ?? Promise.resolve();

    // The caller's actual result/error, produced only after previousTail
    // has settled (regardless of whether it settled by resolving or
    // rejecting — a prior failure must never block or poison this call).
    const result = previousTail.then(fn, fn);

    // The new tail: same timing as `result`, but normalized to a
    // void-resolving promise that never rejects, so the NEXT call's
    // `previousTail.then(fn, fn)` always actually runs `fn` rather than
    // tripping over an unrelated earlier rejection. `.then(noop, noop)`
    // (not `.catch`) so this holds regardless of whether `result` rejects.
    const nextTail: Promise<void> = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, nextTail);

    return result;
  }

  return { run };
}
