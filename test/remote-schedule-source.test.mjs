import test from "node:test";
import assert from "node:assert/strict";
import { dueRemoteClassTriggers, nextRemoteClassTrigger } from "../src/remote-schedule-source.mjs";

const remoteClasses = [
  {
    courseId: "remote-morning",
    courseName: "Remote Morning Class",
    classBeginTime: "10:00",
    classEndTime: "11:40",
    signStatus: 0,
  },
  {
    courseId: "remote-afternoon",
    courseName: "Remote Afternoon Class",
    classBeginTime: "14:00",
    classEndTime: "15:40",
    signStatus: 0,
  },
];

test("dueRemoteClassTriggers uses iclass course times instead of local schedule items", () => {
  const now = new Date("2026-05-18T09:56:00+08:00");
  const due = dueRemoteClassTriggers(remoteClasses, now, 5);

  assert.deepEqual(
    due.map((item) => item.courseId),
    ["remote-morning"],
  );
  assert.equal(due[0].courseName, "Remote Morning Class");
  assert.equal(due[0].startAtText, "2026-05-18T10:00:00.000+08:00");
  assert.equal(due[0].endAtText, "2026-05-18T11:40:00.000+08:00");
  assert.equal(due[0].triggerAtText, "2026-05-18T09:55:00.000+08:00");
});

test("dueRemoteClassTriggers keeps an unsigned remote class due until it ends", () => {
  const now = new Date("2026-05-18T10:30:00+08:00");
  const due = dueRemoteClassTriggers(remoteClasses, now, 5);

  assert.deepEqual(
    due.map((item) => item.courseId),
    ["remote-morning"],
  );
});

test("nextRemoteClassTrigger returns the next future iclass trigger", () => {
  const now = new Date("2026-05-18T10:01:00+08:00");
  const next = nextRemoteClassTrigger(remoteClasses, now, 5);

  assert.equal(next.courseId, "remote-afternoon");
  assert.equal(next.triggerAtText, "2026-05-18T13:55:00.000+08:00");
  assert.equal(next.triggerAtDate.getTime(), new Date("2026-05-18T13:55:00+08:00").getTime());
});
