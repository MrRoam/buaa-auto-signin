import fs from "node:fs";
import path from "node:path";

export class Logger {
  constructor(config) {
    this.enabled = Boolean(config.writeLogs);
    this.file = config.logFile;
    if (this.enabled) fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  info(message, data) {
    this.write("INFO", message, data);
  }

  warn(message, data) {
    this.write("WARN", message, data);
  }

  error(message, data) {
    this.write("ERROR", message, data);
  }

  write(level, message, data) {
    const suffix = data === undefined ? "" : ` ${safeJson(data)}`;
    const line = `[${new Date().toISOString()}] ${level} ${message}${suffix}`;
    console.log(line);
    if (this.enabled) fs.appendFileSync(this.file, `${line}\n`, "utf8");
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
