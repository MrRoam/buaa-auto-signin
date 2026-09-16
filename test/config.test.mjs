import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.mjs";

test("loadConfig preserves optional iclassLoginName separately from studentId", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-signin-config-"));
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      studentId: "mock-student-id",
      iclassLoginName: "Rjc1QkJDMUMxNzVENkY0NkZCNzFDMEM5RjYwNzg4RDg=",
    }),
    "utf8"
  );

  try {
    const config = loadConfig(configPath);

    assert.equal(config.studentId, "mock-student-id");
    assert.equal(config.iclassLoginName, "Rjc1QkJDMUMxNzVENkY0NkZCNzFDMEM5RjYwNzg4RDg=");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig rejects placeholders and unsafe background values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-signin-invalid-config-"));
  const configPath = path.join(dir, "config.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      studentId: "mock-student-id",
      password: "在这里填写你的统一认证密码",
      mode: "auto",
    }));
    assert.throws(() => loadConfig(configPath), /填写统一认证密码/);

    fs.writeFileSync(configPath, JSON.stringify({
      studentId: "mock-student-id",
      password: "mock-password",
      mode: "confirm",
      pollIntervalSeconds: -1,
    }));
    assert.throws(() => loadConfig(configPath), /mode 只支持 auto/);

    fs.writeFileSync(configPath, JSON.stringify({
      studentId: "mock-student-id",
      password: "mock-password",
      mode: "auto",
      writeLogs: "yes",
    }));
    assert.throws(() => loadConfig(configPath), /writeLogs 必须/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
