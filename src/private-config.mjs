import fs from "node:fs";
import { execFileSync } from "node:child_process";

export function writePrivateJson(file, value, options = {}) {
  const temporary = `${file}.${process.pid}.tmp`;
  let renamed = false;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(temporary, 0o600);
    if ((options.platform || process.platform) === "win32") {
      protectWindowsFile(temporary, options.execFileSync || execFileSync);
    }
    fs.renameSync(temporary, file);
    renamed = true;
    if (process.platform !== "win32") fs.chmodSync(file, 0o600);
  } finally {
    if (!renamed && fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function protectWindowsFile(file, run) {
  const identity = run("whoami.exe", [], { encoding: "utf8", windowsHide: true }).trim();
  if (!identity) throw new Error("无法确定当前 Windows 用户，未保存密码配置。");
  run("icacls.exe", [file, "/grant:r", `${identity}:F`], { stdio: "ignore", windowsHide: true });
  run("icacls.exe", [file, "/inheritance:r"], { stdio: "ignore", windowsHide: true });
}

