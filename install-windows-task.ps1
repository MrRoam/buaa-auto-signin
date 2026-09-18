$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LegacyTaskName = "IClassStandaloneSigninAssistant"
$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"
$PollerTaskName = "IClassStandaloneSigninAssistantPoller"
$MainTaskName = "IClassStandaloneSigninAssistantHidden"
$PowerShell = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
if (-not $PowerShell) {
  $PowerShell = (Get-Command pwsh.exe).Source
}

$LegacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
if ($LegacyTask -and $LegacyTask.State -ne "Disabled") {
  if ($LegacyTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $LegacyTaskName
    Start-Sleep -Seconds 2
  }
  try {
    Disable-ScheduledTask -TaskName $LegacyTaskName -ErrorAction Stop | Out-Null
    Write-Host "Disabled legacy direct-node task: $LegacyTaskName"
  } catch {
    Write-Warning "Could not disable legacy direct-node task ${LegacyTaskName}: $($_.Exception.Message)"
  }
}

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$Node = (Get-Command node -ErrorAction Stop).Source
$ValidateConfig = Join-Path $Root "src\validate-config.mjs"
$Config = Join-Path $Root "config.json"
& $Node $ValidateConfig $Config
if ($LASTEXITCODE -ne 0) {
  throw "Invalid configuration. Run npm run setup before installing the scheduled task."
}
$Runner = Join-Path $Root "run-windows-hidden.ps1"
$MainAction = New-ScheduledTaskAction -Execute $PowerShell `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`" -NodePath `"$Node`"" `
  -WorkingDirectory $Root
$MainSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -Hidden `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $MainTaskName -Action $MainAction `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME") `
  -Principal $Principal -Settings $MainSettings `
  -Description "Persistent hidden iclass scheduler, independent of terminal windows" -Force | Out-Null

$PollerTask = Get-ScheduledTask |
  Where-Object { $_.TaskName -eq $PollerTaskName } |
  Select-Object -First 1
if ($PollerTask) {
  if ($PollerTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $PollerTaskName
  }
  try {
    Unregister-ScheduledTask -TaskName $PollerTaskName -Confirm:$false -ErrorAction Stop
    Write-Host "Removed old once-per-interval poller task: $PollerTaskName"
  } catch {
    Write-Warning "Could not remove the old poller task ${PollerTaskName}: $($_.Exception.Message)"
  }
}

# 每 30 分钟跑一次的隐藏健康检查会强制创建一个控制台再隐藏，表现为终端窗口闪烁。
# 它的兜底能力与主任务的 RestartCount + 登录触发重叠，且已被进程内自愈取代，
# 因此不再注册，并清理掉机器上可能残留的旧任务。
$HealthTask = Get-ScheduledTask |
  Where-Object { $_.TaskName -eq $HealthTaskName } |
  Select-Object -First 1
if ($HealthTask) {
  if ($HealthTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $HealthTaskName
    Start-Sleep -Seconds 2
  }
  try {
    Unregister-ScheduledTask -TaskName $HealthTaskName -Confirm:$false -ErrorAction Stop
    Write-Host "Removed periodic health check task (no longer needed): $HealthTaskName"
  } catch {
    Write-Warning "Could not remove the periodic health check task ${HealthTaskName}: $($_.Exception.Message)"
    Write-Warning "Remove it manually in Task Scheduler, or run: Unregister-ScheduledTask -TaskName $HealthTaskName -Confirm:`$false"
  }
} else {
  Write-Host "Periodic health check task is not registered (expected): $HealthTaskName"
}

Write-Host "Installed hidden main task: $MainTaskName"
