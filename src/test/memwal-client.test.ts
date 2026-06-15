import { describe, expect, it } from "vitest";
import { runRetriableMemWalOperation } from "../../lib/memwal/client";

describe("MemWal client retry handling", () => {
  it("retries rate-limited operations using the server retry_after_seconds hint", async () => {
    let attempts = 0;
    const sleeps: number[] = [];

    const result = await runRetriableMemWalOperation(
      "recall",
      "party:test",
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error(
            'MemWal server error (429): {"error":"Rate limit exceeded","layer":"delegate_key","limit":"30 weighted-requests/min","retry_after_seconds":60}'
          );
        }
        return "ok";
      },
      { sleepFn: async (ms) => { sleeps.push(ms); } }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([60_000]);
  });
});
