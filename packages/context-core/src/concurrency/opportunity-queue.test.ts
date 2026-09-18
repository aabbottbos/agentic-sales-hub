import { describe, expect, it } from "vitest";
import { createOpportunityQueue, opportunityKey } from "./opportunity-queue.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("opportunityKey", () => {
  it("joins accountSlug and crmId with '::'", () => {
    expect(opportunityKey("acme-logistics", "006Ax0000GkLmNpQAA")).toBe(
      "acme-logistics::006Ax0000GkLmNpQAA",
    );
  });

  it("produces distinct keys for distinct inputs", () => {
    expect(opportunityKey("a", "1")).not.toBe(opportunityKey("a", "2"));
    expect(opportunityKey("a", "1")).not.toBe(opportunityKey("b", "1"));
  });
});

describe("createOpportunityQueue — ordering", () => {
  it("runs same-key calls strictly in call order despite non-monotonic delays", async () => {
    const queue = createOpportunityQueue();
    const key = opportunityKey("acme-logistics", "opp-1");
    const order: number[] = [];

    // Call 0 is the slowest, call 2 is fastest — if the queue did NOT
    // serialize, order would come out [2, 1, 0] or similar. Call order must
    // still win.
    const delays = [30, 15, 5, 20, 10];
    const calls = delays.map((ms, i) =>
      queue.run(key, async () => {
        await delay(ms);
        order.push(i);
        return i;
      }),
    );

    const results = await Promise.all(calls);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it("each call only starts after the previous one has fully settled (no overlap)", async () => {
    const queue = createOpportunityQueue();
    const key = opportunityKey("acme-logistics", "opp-2");
    let active = 0;
    let maxActive = 0;

    const calls = Array.from({ length: 8 }, () =>
      queue.run(key, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(5);
        active--;
      }),
    );

    await Promise.all(calls);
    expect(maxActive).toBe(1);
  });
});

describe("createOpportunityQueue — cross-key independence", () => {
  it("a slow call at key A does not block a fast call at key B", async () => {
    const queue = createOpportunityQueue();
    const keyA = opportunityKey("acme-logistics", "opp-A");
    const keyB = opportunityKey("meridian-grid", "opp-B");
    const order: string[] = [];

    const slowA = queue.run(keyA, async () => {
      await delay(50);
      order.push("A");
    });
    const fastB = queue.run(keyB, async () => {
      await delay(5);
      order.push("B");
    });

    await Promise.all([slowA, fastB]);
    expect(order).toEqual(["B", "A"]);
  });

  it("different keys can have interleaved in-flight work simultaneously", async () => {
    const queue = createOpportunityQueue();
    const keyA = opportunityKey("acme-logistics", "opp-C");
    const keyB = opportunityKey("meridian-grid", "opp-D");
    let activeA = 0;
    let activeB = 0;
    let bothActiveAtOnce = false;

    const a = queue.run(keyA, async () => {
      activeA++;
      if (activeB > 0) bothActiveAtOnce = true;
      await delay(20);
      activeA--;
    });
    const b = queue.run(keyB, async () => {
      activeB++;
      if (activeA > 0) bothActiveAtOnce = true;
      await delay(20);
      activeB--;
    });

    await Promise.all([a, b]);
    expect(bothActiveAtOnce).toBe(true);
  });
});

describe("createOpportunityQueue — rejection handling", () => {
  it("a rejection propagates to its own caller but does not poison the queue", async () => {
    const queue = createOpportunityQueue();
    const key = opportunityKey("acme-logistics", "opp-E");

    const first = queue.run(key, async () => {
      throw new Error("boom");
    });

    await expect(first).rejects.toThrow("boom");

    // The queue must still be usable afterward at the same key.
    const second = await queue.run(key, async () => "recovered");
    expect(second).toBe("recovered");
  });

  it("subsequent same-key calls still run in order after an earlier rejection", async () => {
    const queue = createOpportunityQueue();
    const key = opportunityKey("acme-logistics", "opp-F");
    const order: string[] = [];

    const r1 = queue.run(key, async () => {
      order.push("1-start");
      await delay(10);
      order.push("1-reject");
      throw new Error("first fails");
    });
    const r2 = queue.run(key, async () => {
      order.push("2-run");
      return "ok-2";
    });
    const r3 = queue.run(key, async () => {
      order.push("3-run");
      return "ok-3";
    });

    const [r1Settled, r2Result, r3Result] = await Promise.allSettled([r1, r2, r3]);

    expect(r1Settled.status).toBe("rejected");
    expect(r2Result).toEqual({ status: "fulfilled", value: "ok-2" });
    expect(r3Result).toEqual({ status: "fulfilled", value: "ok-3" });
    expect(order).toEqual(["1-start", "1-reject", "2-run", "3-run"]);
  });

  it("many interleaved rejections and successes at one key never run concurrently and all settle", async () => {
    const queue = createOpportunityQueue();
    const key = opportunityKey("acme-logistics", "opp-G");
    let active = 0;
    let maxActive = 0;
    const outcomes: Array<"ok" | "err"> = [];

    const calls = Array.from({ length: 10 }, (_, i) =>
      queue
        .run(key, async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await delay(i % 2 === 0 ? 3 : 8);
          active--;
          if (i % 3 === 0) throw new Error(`fail-${i}`);
          return i;
        })
        .then(
          () => outcomes.push("ok"),
          () => outcomes.push("err"),
        ),
    );

    await Promise.all(calls);
    expect(maxActive).toBe(1);
    expect(outcomes).toHaveLength(10);
    // i = 0,3,6,9 reject -> 4 errors, 6 ok
    expect(outcomes.filter((o) => o === "err")).toHaveLength(4);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(6);
  });
});
