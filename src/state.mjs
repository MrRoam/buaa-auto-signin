import fs from "node:fs";
import path from "node:path";

export class HandledState {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = readJson(file, { handled: {} });
  }

  has(key) {
    return Boolean(this.data.handled?.[key]);
  }

  mark(key, payload) {
    this.data.handled ||= {};
    this.data.handled[key] = { at: new Date().toISOString(), ...payload };
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
