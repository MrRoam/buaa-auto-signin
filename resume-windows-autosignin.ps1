$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainTaskName = "IClassStandaloneSigninAssistantHidden"
$InstallScript = Join-Path $Root "install-windows-task.ps1"
$StartScript = Join-Path $Root "start-windows-background.ps1"
$PauseStateFile = Join-Path $Root "state\windows-autosignin-paused.json"

$PauseState = $null
if (Test-Path $PauseStateFile) {
  try {
    $PauseState = Get-Content -Path $PauseStateFile -Raw | ConvertFrom-Json
    Write-Host "Previous pause timestamp: $($PauseState.pausedAt)"
  } catch {
    Write-Warning "Could not read pause state. Restoring the supported autostart path directly: $($_.Exception.Message)"
  }
}

$MainTask = Get-ScheduledTask -TaskName $MainTaskName -ErrorAction SilentlyContinue
if (-not $MainTask) {
  Write-Host "Autostart task not found. Reinstalling: $MainTaskName"
  & $InstallScript
  $MainTask = Get-ScheduledTask -TaskName $MainTaskName -ErrorAction Stop
}

if ($MainTask.State -eq "Disabled") {
  Enable-ScheduledTask -TaskName $MainTaskName | Out-Null
  Write-Host "Re-enabled autostart scheduled task: $MainTaskName"
} else {
  Write-Host "Autostart scheduled task is available: $MainTaskName. State: $($MainTask.State)"
}

& $StartScript

if (Test-Path $PauseStateFile) {
  Remove-Item -Path $PauseStateFile -Force
}

Write-Host "School restore complete. Windows Task Scheduler will keep sign-in running in the background."
