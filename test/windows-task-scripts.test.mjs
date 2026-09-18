import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readScript(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

test("Windows task installer registers one hidden main task and no periodic health check", () => {
  const install = readScript("install-windows-task.ps1");

  assert.match(install, /\$LegacyTaskName = "IClassStandaloneSigninAssistant"/);
  assert.match(install, /-WindowStyle Hidden/);
  assert.match(install, /\$PollerTaskName = "IClassStandaloneSigninAssistantPoller"/);
  assert.match(install, /Unregister-ScheduledTask -TaskName \$PollerTaskName/);
  assert.match(install, /Disable-ScheduledTask -TaskName \$LegacyTaskName/);
  assert.match(install, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(install, /Register-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(install, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(install, /-RestartCount 3/);

  // 每 30 分钟的隐藏健康检查会强制创建控制台并导致终端窗口闪烁，已移除：
  // 只允许“清理已有任务”，不允许再注册。
  assert.match(install, /Unregister-ScheduledTask -TaskName \$HealthTaskName -Confirm:\$false/);
  assert.doesNotMatch(install, /Register-ScheduledTask[\s\S]{0,400}HealthTaskName/);
  assert.doesNotMatch(install, /New-TimeSpan -Minutes 30/);
  assert.doesNotMatch(install, /ensure-windows-background\.ps1/);
});

test("Windows hidden runner keeps the node process detached from terminal windows", () => {
  const runner = readScript("run-windows-hidden.ps1");
  const ensure = readScript("ensure-windows-background.ps1");

  assert.match(runner, /-RedirectStandardError \$StdErrFile/);
  assert.match(runner, /-Wait -PassThru/);
  assert.match(runner, /src\\index\.mjs/);
  assert.doesNotMatch(runner, /--once/);

  // 该脚本现在只在手动兜底时被调用，不再是计划任务。
  assert.match(ensure, /Get-CimInstance Win32_Process/);
  assert.match(ensure, /\$LegacyTaskName = "IClassStandaloneSigninAssistant"/);
  assert.match(ensure, /Stop-ScheduledTask -TaskName \$LegacyTaskName/);
  assert.match(ensure, /Start-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(ensure, /Get-Command node/);
  assert.match(ensure, /src\\index\.mjs/);
  assert.match(ensure, /-RedirectStandardError \$StdErrFile/);
  assert.match(ensure, /-WindowStyle Hidden/);
});

test("Windows launcher keeps errors visible and bootstraps Node.js for first-time users", () => {
  const batch = readScript("run-windows.bat");
  const bootstrap = readScript("setup-and-start-windows.ps1");

  assert.match(batch, /setup-and-start-windows\.ps1/);
  assert.match(batch, /pause/);
  assert.match(bootstrap, /Get-Command node\.exe/);
  assert.match(bootstrap, /OpenJS\.NodeJS\.LTS/);
  assert.match(bootstrap, /Read-Host/);
  assert.match(bootstrap, /src\\setup\.mjs/);
  assert.match(bootstrap, /src\\validate-config\.mjs/);
  assert.match(bootstrap, /icacls\.exe/);
  assert.match(bootstrap, /start-windows-background\.ps1/);
});

test("Windows start script boots the main task directly instead of a health check", () => {
  const start = readScript("start-windows-background.ps1");

  assert.match(start, /\$MainTaskName = "IClassStandaloneSigninAssistantHidden"/);
  assert.match(start, /Start-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(start, /Enable-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(start, /Get-AssistantProcess/);
  assert.doesNotMatch(start, /HealthTaskName/);
  assert.doesNotMatch(start, /IClassStandaloneSigninAssistantHealthCheck/);
});

test("Windows stop disables every restart path and validates stale PID ownership", () => {
  const stop = readScript("stop-windows-background.ps1");

  assert.match(stop, /IClassStandaloneSigninAssistantHealthCheck/);
  assert.match(stop, /Disable-ScheduledTask -TaskName \$TaskName/);
  assert.match(stop, /Get-CimInstance Win32_Process -Filter/);
  assert.match(stop, /src\[\\\\\/\]index\\\.mjs/);
  assert.match(stop, /Ignored stale PID file/);
});

test("Windows vacation pause script disables autostart tasks and stops background runners", () => {
  const pause = readScript("pause-windows-autosignin.ps1");

  assert.match(pause, /\$TaskNames = @\(/);
  assert.match(pause, /"IClassStandaloneSigninAssistantHealthCheck"/);
  assert.match(pause, /"IClassStandaloneSigninAssistantHidden"/);
  assert.match(pause, /"IClassStandaloneSigninAssistant"/);
  assert.match(pause, /"IClassStandaloneSigninAssistantPoller"/);
  assert.match(pause, /Stop-ScheduledTask -TaskName \$TaskName/);
  assert.match(pause, /Disable-ScheduledTask -TaskName \$TaskName/);
  assert.match(pause, /\$FoundActiveEntry = \$true/);
  assert.match(pause, /Write-Warning "Could not stop scheduled task/);
  assert.match(pause, /Write-Warning "Could not disable scheduled task/);
  assert.match(pause, /Get-CimInstance Win32_Process/);
  assert.match(pause, /Stop-Process -Id \$Process\.ProcessId -Force/);
  assert.match(pause, /state\\background\.pid/);
  assert.match(pause, /windows-autosignin-paused\.json/);
});

test("Windows vacation resume script restores the main autostart path and starts the runner", () => {
  const resume = readScript("resume-windows-autosignin.ps1");

  assert.match(resume, /\$MainTaskName = "IClassStandaloneSigninAssistantHidden"/);
  assert.match(resume, /install-windows-task\.ps1/);
  assert.match(resume, /start-windows-background\.ps1/);
  assert.match(resume, /Enable-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(resume, /& \$InstallScript/);
  assert.match(resume, /& \$StartScript/);
  assert.match(resume, /windows-autosignin-paused\.json/);
});

test("PowerShell scripts parse successfully", { skip: process.platform !== "win32" }, () => {
  const scripts = [
    "install-windows-task.ps1",
    "setup-and-start-windows.ps1",
    "start-windows-background.ps1",
    "stop-windows-background.ps1",
    "run-windows-hidden.ps1",
    "ensure-windows-background.ps1",
    "pause-windows-autosignin.ps1",
    "resume-windows-autosignin.ps1",
  ];

  for (const script of scripts) {
    const scriptPath = path.join(root, script).replaceAll("'", "''");
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$null = [scriptblock]::Create((Get-Content -Raw -LiteralPath '${scriptPath}'))`,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, `${script} did not parse:\n${result.stderr || result.stdout}`);
  }
});
