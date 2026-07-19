import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withRepoLock } from "./mutex";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const dirs: string[] = [];

async function realDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("withRepoLock", () => {
  test("serializes two calls against the same key — the second only runs after the first completes", async () => {
    const repoRoot = await realDir("orchestra-mutex-same-");
    const order: string[] = [];

    const first = withRepoLock(repoRoot, async () => {
      order.push("first-start");
      await delay(20);
      order.push("first-end");
    });
    const second = withRepoLock(repoRoot, async () => {
      order.push("second-start");
      await delay(1);
      order.push("second-end");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  test("does not serialize calls against two different keys", async () => {
    const repoA = await realDir("orchestra-mutex-a-");
    const repoB = await realDir("orchestra-mutex-b-");
    const order: string[] = [];

    const a = withRepoLock(repoA, async () => {
      order.push("a-start");
      await delay(20);
      order.push("a-end");
    });
    const b = withRepoLock(repoB, async () => {
      order.push("b-start");
      await delay(1);
      order.push("b-end");
    });

    await Promise.all([a, b]);
    // b's callback ran to completion before a's did — proves they weren't
    // serialized behind one another.
    expect(order.indexOf("b-end")).toBeLessThan(order.indexOf("a-end"));
  });

  // Second independent review round's fix, ported forward as the reject-path
  // regression test this mechanism's correctness rests on: a naive
  // `prior.then(fn)` chain wedges permanently once any call for a key
  // rejects (plan-critique, 2026-07-19, blocking).
  test("a rejected first call does not wedge the lock — the second call still runs", async () => {
    // Promise.allSettled, not sequential `await expect(first)...` then
    // `await expect(second)...` — Bun's test-runner unhandled-rejection
    // detector flags a still-pending sibling promise as unhandled while the
    // first `await` in the test is in flight, even though withRepoLock
    // itself already attaches a handler internally. Collecting settlement
    // immediately sidesteps that false positive.
    const repoRoot = await realDir("orchestra-mutex-reject-");
    const order: string[] = [];

    const first = withRepoLock(repoRoot, async () => {
      order.push("first-ran");
      throw new Error("first call fails");
    });
    const second = withRepoLock(repoRoot, async () => {
      order.push("second-ran");
      return "second-result";
    });

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    expect(firstResult).toMatchObject({ status: "rejected", reason: new Error("first call fails") });
    expect(secondResult).toMatchObject({ status: "fulfilled", value: "second-result" });
    expect(order).toEqual(["first-ran", "second-ran"]);
  });

  test("a third rapid-fire call still queues correctly behind a rejected predecessor", async () => {
    const repoRoot = await realDir("orchestra-mutex-reject-chain-");
    const order: string[] = [];

    const first = withRepoLock(repoRoot, async () => {
      order.push("1");
      throw new Error("fail 1");
    });
    const second = withRepoLock(repoRoot, async () => {
      order.push("2");
      throw new Error("fail 2");
    });
    const third = withRepoLock(repoRoot, async () => {
      order.push("3");
      return "ok";
    });

    const [firstResult, secondResult, thirdResult] = await Promise.allSettled([first, second, third]);
    expect(firstResult.status).toBe("rejected");
    expect(secondResult.status).toBe("rejected");
    expect(thirdResult).toMatchObject({ status: "fulfilled", value: "ok" });
    expect(order).toEqual(["1", "2", "3"]);
  });

  test("two different-looking paths to the same repo (via a symlink) share one lock", async () => {
    const real = await realDir("orchestra-mutex-canon-real-");
    const parent = await realDir("orchestra-mutex-canon-link-");
    const link = path.join(parent, "alias");
    await Bun.$`ln -s ${real} ${link}`.quiet();

    const order: string[] = [];
    const viaReal = withRepoLock(real, async () => {
      order.push("real-start");
      await delay(20);
      order.push("real-end");
    });
    const viaLink = withRepoLock(link, async () => {
      order.push("link-start");
      await delay(1);
      order.push("link-end");
    });

    await Promise.all([viaReal, viaLink]);
    expect(order).toEqual(["real-start", "real-end", "link-start", "link-end"]);
  });
});
