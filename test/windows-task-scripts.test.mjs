import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readScript(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

test("Windows task installer uses a hidden health check to bootstrap the persistent runner", () => {
  const install = readScript("install-windows-task.ps1");

  assert.match(install, /\$LegacyTaskName = "IClassStandaloneSigninAssistant"/);
  assert.match(install, /\$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"/);
  assert.match(install, /-WindowStyle Hidden/);
  assert.match(install, /ensure-windows-background\.ps1/);
  assert.match(install, /New-TimeSpan -Minutes 30/);
  assert.match(install, /\$PollerTaskName = "IClassStandaloneSigninAssistantPoller"/);
  assert.match(install, /Unregister-ScheduledTask -TaskName \$PollerTaskName/);
  assert.match(install, /Disable-ScheduledTask -TaskName \$LegacyTaskName/);
  assert.match(install, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(install, /Register-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(install, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(install, /-RestartCount 3/);
});

test("Windows hidden runner and health check scripts avoid foreground node launches", () => {
  const runner = readScript("run-windows-hidden.ps1");
  const health = readScript("ensure-windows-background.ps1");

  assert.match(runner, /-RedirectStandardError \$StdErrFile/);
  assert.match(runner, /-Wait -PassThru/);
  assert.match(runner, /src\\index\.mjs/);
  assert.doesNotMatch(runner, /--once/);

  assert.match(health, /Get-CimInstance Win32_Process/);
  assert.match(health, /\$LegacyTaskName = "IClassStandaloneSigninAssistant"/);
  assert.match(health, /Stop-ScheduledTask -TaskName \$LegacyTaskName/);
  assert.match(health, /Start-ScheduledTask -TaskName \$MainTaskName/);
  assert.match(health, /Get-Command node/);
  assert.match(health, /src\\index\.mjs/);
  assert.match(health, /-RedirectStandardError \$StdErrFile/);
  assert.match(health, /-WindowStyle Hidden/);
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

test("Windows vacation resume script restores the supported autostart path and starts the runner", () => {
  const resume = readScript("resume-windows-autosignin.ps1");

  assert.match(resume, /\$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"/);
  assert.match(resume, /install-windows-task\.ps1/);
  assert.match(resume, /start-windows-background\.ps1/);
  assert.match(resume, /Enable-ScheduledTask -TaskName \$HealthTaskName/);
  assert.match(resume, /& \$InstallScript/);
  assert.match(resume, /& \$StartScript/);
  assert.match(resume, /windows-autosignin-paused\.json/);
});

test("Windows PowerShell scripts parse successfully", () => {
  const scripts = [
    "install-windows-task.ps1",
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
