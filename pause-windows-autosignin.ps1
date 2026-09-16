$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskNames = @(
  "IClassStandaloneSigninAssistantHealthCheck",
  "IClassStandaloneSigninAssistantHidden",
  "IClassStandaloneSigninAssistant",
  "IClassStandaloneSigninAssistantPoller"
)
$PidFile = Join-Path $Root "state\background.pid"
$PauseStateFile = Join-Path $Root "state\windows-autosignin-paused.json"

function Get-AssistantProcess {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "src[\\/]index\.mjs" -and
      $_.CommandLine -match [regex]::Escape($Root) -and
      $_.CommandLine -notmatch "--once"
    }
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "state") | Out-Null

$TaskStates = @()
$StoppedSomething = $false
$FoundActiveEntry = $false
$HadWarnings = $false

foreach ($TaskName in $TaskNames) {
  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $Task) {
    continue
  }

  $TaskStates += [pscustomobject]@{
    taskName = $TaskName
    state = [string]$Task.State
    wasEnabled = ([string]$Task.State -ne "Disabled")
  }

  if ($Task.State -eq "Running") {
    $FoundActiveEntry = $true
    try {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      Start-Sleep -Seconds 2
      Write-Host "Stopped running scheduled task: $TaskName"
      $StoppedSomething = $true
    } catch {
      Write-Warning "Could not stop scheduled task ${TaskName}: $($_.Exception.Message)"
      $HadWarnings = $true
    }
  }

  if ($Task.State -ne "Disabled") {
    $FoundActiveEntry = $true
    try {
      Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
      Write-Host "Disabled autostart scheduled task: $TaskName"
      $StoppedSomething = $true
    } catch {
      Write-Warning "Could not disable scheduled task ${TaskName}: $($_.Exception.Message)"
      $HadWarnings = $true
    }
  } else {
    Write-Host "Scheduled task was already disabled: $TaskName"
  }
}

$PauseState = [pscustomobject]@{
  pausedAt = (Get-Date).ToString("o")
  root = $Root
  taskStates = $TaskStates
}
$PauseState | ConvertTo-Json -Depth 4 | Set-Content -Path $PauseStateFile -Encoding utf8

$Processes = @(Get-AssistantProcess)
foreach ($Process in $Processes) {
  $FoundActiveEntry = $true
  try {
    Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped background sign-in process. PID: $($Process.ProcessId)"
    $StoppedSomething = $true
  } catch {
    Write-Warning "Could not stop background sign-in process $($Process.ProcessId): $($_.Exception.Message)"
    $HadWarnings = $true
  }
}

if (Test-Path $PidFile) {
  try {
    $PidText = Get-Content -Path $PidFile -Raw
    $BackgroundPid = [int]($PidText.Trim())
    $BackgroundProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $BackgroundPid" -ErrorAction SilentlyContinue

    if (
      $BackgroundProcess -and
      $BackgroundProcess.CommandLine -and
      $BackgroundProcess.CommandLine -match [regex]::Escape($Root)
    ) {
      $FoundActiveEntry = $true
      Stop-Process -Id $BackgroundPid -Force -ErrorAction Stop
      Write-Host "Stopped legacy hidden background process. PID: $BackgroundPid"
      $StoppedSomething = $true
    }
  } catch {
    Write-Warning "Could not stop legacy hidden background process from PID file: $($_.Exception.Message)"
    $HadWarnings = $true
  } finally {
    Remove-Item -Path $PidFile -Force
  }
}

if (-not $FoundActiveEntry) {
  Write-Host "No running or enabled auto sign-in background entry was found."
}

if ($HadWarnings) {
  Write-Warning "Some entries could not be changed. If auto sign-in restarts, run this script from an administrator PowerShell window."
  Write-Warning "Administrator command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
}

Write-Host "Vacation pause complete. Restore later with: .\resume-windows-autosignin.ps1"
