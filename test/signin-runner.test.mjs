import test from "node:test";
import assert from "node:assert/strict";
import { checkOnce } from "../src/signin-runner.mjs";

test("checkOnce signs due iclass classes directly from the remote schedule", async () => {
  const signedCourseIds = [];
  const marked = [];
  const client = {
    async getClasses() {
      return [
        {
          courseId: "remote-course-101",
          courseName: "Remote Course",
          classBeginTime: "10:00",
          classEndTime: "11:40",
          signStatus: 0,
        },
      ];
    },
    async signIn(courseId) {
      signedCourseIds.push(courseId);
      return { success: true, message: "签到成功" };
    },
  };
  const handledKeys = new Set();
  const state = {
    has(key) {
      return handledKeys.has(key);
    },
    mark(key, payload) {
      handledKeys.add(key);
      marked.push({ key, payload });
    },
  };
  const logger = memoryLogger();

  const result = await checkOnce({
    now: new Date("2026-05-18T09:56:00+08:00"),
    config: { triggerMinutesBeforeClass: 5, studentId: "student-a" },
    client,
    state,
    logger,
    dryRun: false,
  });

  assert.deepEqual(signedCourseIds, ["remote-course-101"]);
  assert.match(marked[0].key, /^iclass:[a-f0-9]{16}:20260518:remote-course-101:10:00$/);
  assert.equal(marked[0].payload.result, "signed");
  assert.deepEqual(result.unhandledDue, []);
});

function memoryLogger() {
  return {
    entries: [],
    info(message, data) {
      this.entries.push({ level: "info", message, data });
    },
    warn(message, data) {
      this.entries.push({ level: "warn", message, data });
    },
    error(message, data) {
      this.entries.push({ level: "error", message, data });
    },
  };
}
