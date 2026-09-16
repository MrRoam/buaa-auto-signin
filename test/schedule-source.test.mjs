import test from "node:test";
import assert from "node:assert/strict";
import { dueClassTriggers, nextClassTrigger } from "../src/schedule-source.mjs";

const schedule = {
  items: [
    {
      id: "morning",
      type: "class",
      title: "Morning Class",
      startAt: "2026-05-18T10:00:00+08:00",
      endAt: "2026-05-18T11:40:00+08:00",
    },
    {
      id: "afternoon",
      type: "class",
      title: "Afternoon Class",
      startAt: "2026-05-18T14:00:00+08:00",
      endAt: "2026-05-18T15:40:00+08:00",
    },
    {
      id: "hidden",
      type: "class",
      title: "Hidden Class",
      startAt: "2026-05-18T09:50:00+08:00",
      endAt: "2026-05-18T10:30:00+08:00",
      isHidden: true,
    },
  ],
};

test("dueClassTriggers returns classes whose local trigger window has arrived", () => {
  const now = new Date("2026-05-18T09:56:00+08:00");
  const due = dueClassTriggers(schedule, now, 5);

  assert.deepEqual(
    due.map((item) => item.id),
    ["morning"],
  );
  assert.equal(due[0].triggerAtText, "2026-05-18T09:55:00.000+08:00");
});

test("dueClassTriggers skips classes after their start time", () => {
  const now = new Date("2026-05-18T10:01:00+08:00");
  const due = dueClassTriggers(schedule, now, 5);

  assert.deepEqual(due.map((item) => item.id), []);
});

test("nextClassTrigger returns the earliest future local trigger", () => {
  const now = new Date("2026-05-18T10:01:00+08:00");
  const next = nextClassTrigger(schedule, now, 5);

  assert.equal(next.id, "afternoon");
  assert.equal(next.triggerAtText, "2026-05-18T13:55:00.000+08:00");
  assert.equal(next.triggerAtDate.getTime(), new Date("2026-05-18T13:55:00+08:00").getTime());
});
