import test from "node:test";
import assert from "node:assert/strict";
import {
  computeErrorBackoffMs,
  installFatalErrorHandlers,
  runResilientLoop,
  DEFAULT_ERROR_BACKOFF,
} from "../src/resilience.mjs";

test("computeErrorBackoffMs grows exponentially and stays capped", () => {
  assert.equal(computeErrorBackoffMs(1, { baseMs: 1000, multiplier: 2, maxMs: 10000 }), 1000);
  assert.equal(computeErrorBackoffMs(2, { baseMs: 1000, multiplier: 2, maxMs: 10000 }), 2000);
  assert.equal(computeErrorBackoffMs(3, { baseMs: 1000, multiplier: 2, maxMs: 10000 }), 4000);
  assert.equal(computeErrorBackoffMs(4, { baseMs: 1000, multiplier: 2, maxMs: 10000 }), 8000);
  assert.equal(computeErrorBackoffMs(99, { baseMs: 1000, multiplier: 2, maxMs: 10000 }), 10000);
});

test("computeErrorBackoffMs tolerates invalid counters", () => {
  assert.equal(computeErrorBackoffMs(0), DEFAULT_ERROR_BACKOFF.baseMs);
  assert.equal(computeErrorBackoffMs(-5), DEFAULT_ERROR_BACKOFF.baseMs);
  assert.equal(computeErrorBackoffMs(undefined), DEFAULT_ERROR_BACKOFF.baseMs);
  assert.equal(computeErrorBackoffMs("abc"), DEFAULT_ERROR_BACKOFF.baseMs);
});

function makeStepRunner(step, { backoff = { baseMs: 1000, multiplier: 2, maxMs: 10000 } } = {}) {
  const slept = [];
  const errors = [];
  const calls = [];
  const run = runResilientLoop(
    async () => {
      calls.push(slept.length);
      return step(calls.length);
    },
    {
      logger: { error: (message, data) => errors.push({ message, data }) },
      sleep: async (ms) => { slept.push(ms); },
      backoff,
    },
  );
  return { run, slept, errors, calls };
}

test("runResilientLoop honors the step's sleep interval instead of busy-polling", async () => {
  const { run, slept, calls } = makeStepRunner((call) => {
    if (call === 3) return { done: true, value: "finished" };
    return { sleepMs: 900_000 };
  });

  assert.equal(await run, "finished");
  // 关键回归：每一步的 sleep 必须被消费，否则退化成紧密轮询。
  assert.deepEqual(slept, [900_000, 900_000]);
  assert.equal(calls.length, 3);
});

test("runResilientLoop keeps running after a throwing step instead of dying", async () => {
  const { run, slept, errors } = makeStepRunner((call) => {
    if (call === 1) throw new Error("第一次意外失败");
    if (call === 2) throw new Error("第二次意外失败");
    return { done: true, value: "finished" };
  });

  assert.equal(await run, "finished");
  assert.deepEqual(slept, [1000, 2000]);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].data.consecutiveErrors, 1);
  assert.equal(errors[1].data.consecutiveErrors, 2);
  assert.match(errors[0].data.message, /第一次意外失败/);
});

test("runResilientLoop resets the error backoff counter after a successful step", async () => {
  const { run, slept } = makeStepRunner((call) => {
    if (call === 1 || call === 3) throw new Error(`fail ${call}`);
    if (call === 4) return { done: true, value: null };
    return { sleepMs: 0 };
  });

  await run;
  // 第 2 次成功把计数清零，因此第 3 次失败重新从 base 退避开始；
  // sleepMs 为 0 的步骤不产生 sleep。
  assert.deepEqual(slept, [1000, 1000]);
});

test("runResilientLoop works without a logger and ignores invalid intervals", async () => {
  const slept = [];
  let calls = 0;
  const value = await runResilientLoop(async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    if (calls === 2) return { sleepMs: Number.NaN };
    if (calls === 3) return { sleepMs: -5 };
    return { done: true, value: 42 };
  }, { sleep: async (ms) => { slept.push(ms); } });

  assert.equal(value, 42);
  assert.equal(slept.length, 1);
});

test("installFatalErrorHandlers logs then exits with a non-zero code", () => {
  const errors = [];
  const exits = [];
  const originalUncaught = process.listeners("uncaughtException").slice();
  const originalRejection = process.listeners("unhandledRejection").slice();

  try {
    installFatalErrorHandlers({
      logger: { error: (message, data) => errors.push({ message, data }) },
      exit: (code) => exits.push(code),
    });

    const added = process.listeners("uncaughtException").filter((fn) => !originalUncaught.includes(fn));
    assert.equal(added.length, 1);
    added[0](new Error("致命错误"));

    assert.equal(exits[0], 1);
    assert.match(errors[0].message, /uncaughtException/);
    assert.match(errors[0].data.message, /致命错误/);
  } finally {
    for (const fn of process.listeners("uncaughtException")) {
      if (!originalUncaught.includes(fn)) process.removeListener("uncaughtException", fn);
    }
    for (const fn of process.listeners("unhandledRejection")) {
      if (!originalRejection.includes(fn)) process.removeListener("unhandledRejection", fn);
    }
  }
});
