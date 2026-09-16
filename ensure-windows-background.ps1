$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainTaskName = "IClassStandaloneSigninAssistantHidden"
$LegacyTaskName = "IClassStandaloneSigninAssistant"
$Node = (Get-Command node).Source
$Script = Join-Path $Root "src\index.mjs"
$Config = Join-Path $Root "config.json"
$HealthLog = Join-Path $Root "logs\healthcheck.log"
$StdOutFile = Join-Path $Root "logs\background.stdout.log"
$StdErrFile = Join-Path $Root "logs\background.stderr.log"

function Write-HealthLog {
  param([string]$Message)
  New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
  $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
  Add-Content -Path $HealthLog -Value "[$Timestamp] $Message" -Encoding utf8
}

function Get-AssistantProcess {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "src[\\/]index\.mjs" -and
      $_.CommandLine -match [regex]::Escape($Root) -and
      $_.CommandLine -notmatch "--once"
    }
}

$LegacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
if ($LegacyTask -and $LegacyTask.State -eq "Running") {
  try {
    Stop-ScheduledTask -TaskName $LegacyTaskName -ErrorAction Stop
    Start-Sleep -Seconds 2
    Write-HealthLog "Stopped running legacy direct-node task: $LegacyTaskName"
  } catch {
    Write-HealthLog "Could not stop legacy direct-node task ${LegacyTaskName}: $($_.Exception.Message)"
  }
}

$Running = @(Get-AssistantProcess)
if ($Running.Count -gt 0) {
  Write-HealthLog "Assistant already running. PID(s): $($Running.ProcessId -join ', ')"
  exit 0
}

$Task = Get-ScheduledTask -TaskName $MainTaskName -ErrorAction SilentlyContinue
if ($Task) {
  Write-HealthLog "Assistant process missing; starting scheduled task $MainTaskName."
  Start-ScheduledTask -TaskName $MainTaskName
  Start-Sleep -Seconds 5

  $Running = @(Get-AssistantProcess)
  if ($Running.Count -gt 0) {
    Write-HealthLog "Scheduled task started assistant. PID(s): $($Running.ProcessId -join ', ')"
    exit 0
  }
}

Write-HealthLog "Scheduled task did not start assistant; falling back to hidden node process."
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
Start-Process `
  -FilePath $Node `
  -ArgumentList @("`"$Script`"", "--config", "`"$Config`"") `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $StdOutFile `
  -RedirectStandardError $StdErrFile | Out-Null
