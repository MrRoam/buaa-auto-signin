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
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, this.file);
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${file}.${timestamp}.${process.pid}.corrupt`;
    try {
      fs.renameSync(file, backup);
      console.error(`状态文件损坏，已移到 ${backup} 并使用空状态（${error.message}）`);
    } catch (backupError) {
      throw new Error(`状态文件损坏且无法备份：${file}（${backupError.message}）`);
    }
    return fallback;
  }
}
