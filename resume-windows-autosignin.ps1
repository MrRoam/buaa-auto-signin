$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"
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

$HealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction SilentlyContinue
if (-not $HealthTask) {
  Write-Host "Health check task not found. Reinstalling: $HealthTaskName"
  & $InstallScript
  $HealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction Stop
}

if ($HealthTask.State -eq "Disabled") {
  Enable-ScheduledTask -TaskName $HealthTaskName | Out-Null
  Write-Host "Re-enabled autostart scheduled task: $HealthTaskName"
} else {
  Write-Host "Autostart scheduled task is available: $HealthTaskName. State: $($HealthTask.State)"
}

& $StartScript

if (Test-Path $PauseStateFile) {
  Remove-Item -Path $PauseStateFile -Force
}

Write-Host "School restore complete. Windows Task Scheduler will keep sign-in running in the background."
