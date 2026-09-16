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
