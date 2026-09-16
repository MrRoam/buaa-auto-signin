$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskNames = @(
  "IClassStandaloneSigninAssistantHealthCheck",
  "IClassStandaloneSigninAssistantHidden",
  "IClassStandaloneSigninAssistant",
  "IClassStandaloneSigninAssistantPoller"
)
$PidFile = Join-Path $Root "state\background.pid"
$Changed = $false

function Get-AssistantProcess {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "src[\\/]index\.mjs" -and
      $_.CommandLine -match [regex]::Escape($Root) -and
      $_.CommandLine -notmatch "--once"
    }
}

foreach ($TaskName in $TaskNames) {
  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $Task) { continue }
  if ($Task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Start-Sleep -Seconds 1
  }
  if ($Task.State -ne "Disabled") {
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
  }
  Write-Host "Stopped and disabled scheduled task: $TaskName"
  $Changed = $true
}

foreach ($Process in @(Get-AssistantProcess)) {
  Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop
  Write-Host "Stopped assistant process. PID: $($Process.ProcessId)"
  $Changed = $true
}

if (Test-Path -LiteralPath $PidFile) {
  try {
    $BackgroundPid = [int]((Get-Content -LiteralPath $PidFile -Raw).Trim())
    $BackgroundProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $BackgroundPid" -ErrorAction SilentlyContinue
    $OwnedProcess = $BackgroundProcess -and $BackgroundProcess.CommandLine -and `
      $BackgroundProcess.CommandLine -match "src[\\/]index\.mjs" -and `
      $BackgroundProcess.CommandLine -match [regex]::Escape($Root)
    if ($OwnedProcess) {
      Stop-Process -Id $BackgroundPid -Force -ErrorAction Stop
      Write-Host "Stopped legacy assistant process. PID: $BackgroundPid"
      $Changed = $true
    } elseif ($BackgroundProcess) {
      Write-Warning "Ignored stale PID file because PID $BackgroundPid belongs to another process."
    }
  } finally {
    Remove-Item -LiteralPath $PidFile -Force
  }
}

if (-not $Changed) {
  Write-Host "No running or enabled auto sign-in entry was found."
}
Write-Host "Auto sign-in is stopped and will stay disabled. Start it again with: .\start-windows-background.ps1"
