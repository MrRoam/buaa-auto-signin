import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HandledState } from "../src/state.mjs";
import { remoteStateKey, dueRemoteClassTriggers } from "../src/remote-schedule-source.mjs";
import { fetchTextWithTimeout } from "../src/http-utils.mjs";
import { writePrivateJson } from "../src/private-config.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("first-time setup never disables TLS certificate validation", () => {
  const setup = fs.readFileSync(path.join(root, "src/setup.mjs"), "utf8");
  assert.doesNotMatch(setup, /NODE_TLS_REJECT_UNAUTHORIZED/);
});

test("handled state keys are isolated between student accounts", () => {
  const item = dueRemoteClassTriggers([{
    courseId: "course-1",
    courseName: "Course",
    classBeginTime: "10:00",
    classEndTime: "11:00",
  }], new Date("2026-05-18T10:10:00+08:00"), 5)[0];
  assert.notEqual(remoteStateKey(item, "student-a"), remoteStateKey(item, "student-b"));
});

test("handled state writes valid JSON atomically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-signin-state-"));
  const file = path.join(dir, "handled.json");
  try {
    const state = new HandledState(file);
    state.mark("key", { result: "signed" });
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).handled.key.result, "signed");
    assert.deepEqual(fs.readdirSync(dir), ["handled.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("failed private config writes remove plaintext temporary files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-signin-private-config-"));
  const impossibleTarget = path.join(dir, "existing-directory");
  fs.mkdirSync(impossibleTarget);
  const temporary = `${impossibleTarget}.${process.pid}.tmp`;
  try {
    assert.throws(() => writePrivateJson(impossibleTarget, { password: "secret" }, { platform: "linux" }));
    assert.equal(fs.existsSync(temporary), false);
    const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    assert.match(ignore, /config\.json\.\*\.tmp/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt handled state is preserved before new state is written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-signin-corrupt-state-"));
  const file = path.join(dir, "handled.json");
  try {
    fs.writeFileSync(file, "{broken", "utf8");
    const state = new HandledState(file);
    state.mark("new-key", { result: "signed" });
    const files = fs.readdirSync(dir);
    assert.equal(files.includes("handled.json"), true);
    assert.equal(files.some((name) => name.endsWith(".corrupt")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("network requests abort instead of hanging forever", async () => {
  const neverResponds = (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(
    () => fetchTextWithTimeout(neverResponds, "https://iclass.buaa.edu.cn/test", {}, 10),
    /请求超时/,
  );
});

test("network timeout also covers a response body that never finishes", async () => {
  const hangingBody = async (_input, options) => new Response(new ReadableStream({
    start(controller) {
      options.signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
    },
  }));
  await assert.rejects(
    () => fetchTextWithTimeout(hangingBody, "https://iclass.buaa.edu.cn/test", {}, 10),
    /请求超时/,
  );
});
