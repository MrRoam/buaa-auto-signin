import test from "node:test";
import assert from "node:assert/strict";
import { IclassClient } from "../src/iclass-client.mjs";

test("IclassClient queries remote iclass classes and signs by course schedule id", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push({
      method: options.method || "GET",
      url: url.toString(),
      headers: options.headers || {},
      body: options.body || "",
    });

    if (url.pathname === "/app/user/login.action") {
      assert.equal(url.searchParams.get("phone"), "mock-student-id");
      assert.equal(url.searchParams.get("userLevel"), "1");
      assert.equal(url.searchParams.get("verificationType"), "2");
      return jsonResponse({ STATUS: 0, result: { id: "user-1", sessionId: "session-1" } });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      assert.equal(url.searchParams.get("id"), "user-1");
      assert.equal(url.searchParams.get("dateStr"), "20260518");
      assert.equal(options.headers.sessionId, "session-1");
      return jsonResponse({
        STATUS: 0,
        result: [
          {
            id: "course-1",
            courseName: "Software Engineering",
            classBeginTime: "08:00",
            classEndTime: "09:40",
            signStatus: 0,
          },
        ],
      });
    }

    if (url.pathname === "/app/common/get_timestamp.action") {
      assert.equal(url.protocol, "https:");
      assert.equal(url.port, "8347");
      return jsonResponse({ timestamp: "1713600000" });
    }

    if (url.pathname === "/app/course/stu_scan_sign.action") {
      assert.equal(url.protocol, "https:");
      assert.equal(url.port, "8347");
      assert.equal(options.method, "POST");
      assert.equal(url.searchParams.get("courseSchedId"), "course-1");
      assert.equal(url.searchParams.get("timestamp"), "1713600000");
      assert.equal(options.headers.sessionId, "session-1");
      assert.equal(options.body, "id=user-1");
      return jsonResponse({ STATUS: 0, ERRMSG: "签到成功", result: { stuSignStatus: 1 } });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({ studentId: "mock-student-id", logger: memoryLogger() });
    const classes = await client.getClasses(new Date("2026-05-18T09:00:00+08:00"));
    const signin = await client.signIn(classes[0].courseId);

    assert.deepEqual(classes, [
      {
        courseId: "course-1",
        courseName: "Software Engineering",
        classBeginTime: "08:00",
        classEndTime: "09:40",
        signStatus: 0,
        raw: {
          id: "course-1",
          courseName: "Software Engineering",
          classBeginTime: "08:00",
          classEndTime: "09:40",
          signStatus: 0,
        },
      },
    ]);
    assert.deepEqual(signin, { success: true, message: "签到成功", raw: { STATUS: 0, ERRMSG: "签到成功", result: { stuSignStatus: 1 } } });
    assert.equal(requests.filter((request) => request.url.includes("/app/user/login.action")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient uses configured iclass loginName instead of studentId for app login", async () => {
  const originalFetch = globalThis.fetch;
  let loginPhone = "";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/app/user/login.action") {
      loginPhone = url.searchParams.get("phone");
      return jsonResponse({ STATUS: 0, result: { id: "user-1", sessionId: "session-1" } });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      return jsonResponse({ STATUS: 0, result: [] });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({
      studentId: "mock-student-id",
      iclassLoginName: "Rjc1QkJDMUMxNzVENkY0NkZCNzFDMEM5RjYwNzg4RDg=",
      logger: memoryLogger(),
    });
    await client.getClasses(new Date("2026-05-18T09:00:00+08:00"));

    assert.equal(loginPhone, "Rjc1QkJDMUMxNzVENkY0NkZCNzFDMEM5RjYwNzg4RDg=");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient decodes a percent-encoded iclass loginName copied from URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/app/user/login.action") {
      assert.equal(url.searchParams.get("phone"), "encoded=value");
      return jsonResponse({ STATUS: 0, result: { id: "user-1", sessionId: "session-1" } });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      return jsonResponse({ STATUS: 0, result: [] });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({
      studentId: "mock-student-id",
      iclassLoginName: "encoded%3Dvalue",
      logger: memoryLogger(),
    });

    await client.getClasses(new Date("2026-05-18T09:00:00+08:00"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient retries login with a fresh request after a transient user-not-found response", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let loginAttempts = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push({
      method: options.method || "GET",
      url: url.toString(),
      headers: options.headers || {},
      body: options.body || "",
    });

    if (url.pathname === "/app/user/login.action") {
      assert.equal(url.searchParams.get("phone"), "mock-student-id");
      assert.equal(url.searchParams.has("_"), true);
      assert.equal(options.headers["Cache-Control"], "no-cache");
      assert.equal(options.headers.Connection, "close");
      loginAttempts += 1;
      if (loginAttempts === 1) {
        return jsonResponse({ STATUS: 1, ERRMSG: "用户不存在！" });
      }
      return jsonResponse({ STATUS: 0, result: { id: "user-1", sessionId: "session-1" } });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      return jsonResponse({ STATUS: 0, result: [] });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({ studentId: "mock-student-id", logger: memoryLogger() });
    const classes = await client.getClasses(new Date("2026-05-18T09:00:00+08:00"));

    assert.deepEqual(classes, []);
    assert.equal(requests.filter((request) => request.url.includes("/app/user/login.action")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient clears a stale session and logs in again when the remote schedule rejects it", async () => {
  const originalFetch = globalThis.fetch;
  const classSessionIds = [];
  let loginAttempts = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.pathname === "/app/user/login.action") {
      loginAttempts += 1;
      return jsonResponse({
        STATUS: 0,
        result: {
          id: `user-${loginAttempts}`,
          sessionId: `session-${loginAttempts}`,
        },
      });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      classSessionIds.push(options.headers.sessionId);
      if (classSessionIds.length === 1) {
        return jsonResponse({ STATUS: 1, ERRMSG: "登录失效，请重新登录" });
      }
      return jsonResponse({
        STATUS: 0,
        result: [
          {
            id: "course-1",
            courseName: "Recovered Course",
            classBeginTime: "08:00",
            classEndTime: "09:40",
            signStatus: 0,
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({ studentId: "mock-student-id", logger: memoryLogger() });
    const classes = await client.getClasses(new Date("2026-05-18T09:00:00+08:00"));

    assert.deepEqual(classSessionIds, ["session-1", "session-2"]);
    assert.equal(loginAttempts, 2);
    assert.equal(classes[0].courseName, "Recovered Course");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient does not retry the remote schedule after login recovery is exhausted", async () => {
  const originalFetch = globalThis.fetch;
  let loginAttempts = 0;
  let classAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/app/user/login.action") {
      loginAttempts += 1;
      return jsonResponse({ STATUS: 1, ERRMSG: "用户不存在！" });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      classAttempts += 1;
      return jsonResponse({ STATUS: 0, result: [] });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({ studentId: "mock-student-id", logger: memoryLogger() });

    await assert.rejects(
      () => client.getClasses(new Date("2026-05-18T09:00:00+08:00")),
      /iclass 登录失败：用户不存在！/
    );
    assert.equal(loginAttempts, 2);
    assert.equal(classAttempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IclassClient treats iclass STATUS 2 as an empty remote schedule", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/app/user/login.action") {
      return jsonResponse({ STATUS: 0, result: { id: "user-1", sessionId: "session-1" } });
    }

    if (url.pathname === "/app/course/get_stu_course_sched.action") {
      return jsonResponse({ STATUS: 2, ERRMSG: "无数据" });
    }

    throw new Error(`Unexpected request: ${url.toString()}`);
  };

  try {
    const client = new IclassClient({ studentId: "mock-student-id", logger: memoryLogger() });
    const classes = await client.getClasses(new Date("2026-05-31T09:00:00+08:00"));

    assert.deepEqual(classes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function memoryLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}
