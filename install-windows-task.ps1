$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LegacyTaskName = "IClassStandaloneSigninAssistant"
$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"
$PollerTaskName = "IClassStandaloneSigninAssistantPoller"
$MainTaskName = "IClassStandaloneSigninAssistantHidden"
$HealthCheck = Join-Path $Root "ensure-windows-background.ps1"
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
$HealthAction = New-ScheduledTaskAction `
  -Execute $PowerShell `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$HealthCheck`"" `
  -WorkingDirectory $Root
$HealthTriggers = @(
  New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).Date `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
)
$HealthSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -Hidden

$ExistingHealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction SilentlyContinue
if ($ExistingHealthTask) {
  if ($ExistingHealthTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $HealthTaskName
    Start-Sleep -Seconds 2
  }
  Unregister-ScheduledTask -TaskName $HealthTaskName -Confirm:$false
}
Register-ScheduledTask `
  -TaskName $HealthTaskName `
  -Action $HealthAction `
  -Trigger $HealthTriggers `
  -Principal $Principal `
  -Settings $HealthSettings `
  -Description "Hidden health check that restarts the iclass sign-in scheduler if it is not running" `
  -Force | Out-Null

$PollerTask = Get-ScheduledTask -TaskName $PollerTaskName -ErrorAction SilentlyContinue
if ($PollerTask) {
  if ($PollerTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $PollerTaskName
  }
  Unregister-ScheduledTask -TaskName $PollerTaskName -Confirm:$false
  Write-Host "Removed old once-per-interval poller task: $PollerTaskName"
}

Write-Host "Installed hidden health check task: $HealthTaskName"
