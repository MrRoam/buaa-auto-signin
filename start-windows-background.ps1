$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"
$InstallScript = Join-Path $Root "install-windows-task.ps1"
$HealthCheckScript = Join-Path $Root "ensure-windows-background.ps1"
$LogFile = Join-Path $Root "logs\assistant.log"
$PidFile = Join-Path $Root "state\background.pid"
$Node = (Get-Command node -ErrorAction Stop).Source
$ValidateConfig = Join-Path $Root "src\validate-config.mjs"
$Config = Join-Path $Root "config.json"

& $Node $ValidateConfig $Config
if ($LASTEXITCODE -ne 0) {
  throw "Invalid configuration. Run npm run setup before starting the background assistant."
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

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "state") | Out-Null

if (Test-Path $PidFile) {
  Remove-Item -Path $PidFile -Force
}

$MainTaskName = "IClassStandaloneSigninAssistantHidden"
& $InstallScript
foreach ($TaskName in @($MainTaskName, $HealthTaskName)) {
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
}

$Running = @(Get-AssistantProcess)
if ($Running.Count -gt 0) {
  Write-Host "Background assistant is already running. PID(s): $($Running.ProcessId -join ', ')"
  Write-Host "Log file: $LogFile"
  exit 0
}

$HealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction SilentlyContinue
if (-not $HealthTask) {
  try {
    & $InstallScript
    $HealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction Stop
  } catch {
    Write-Host "Cannot create Windows health check task."
    Write-Host "Reason: $($_.Exception.Message)"
    exit 1
  }
}

Start-ScheduledTask -TaskName $HealthTaskName
for ($Attempt = 0; $Attempt -lt 15; $Attempt++) {
  Start-Sleep -Seconds 2
  $Running = @(Get-AssistantProcess)
  if ($Running.Count -gt 0) { break }
}

if ($Running.Count -eq 0) {
  Write-Host "Health check did not start the background assistant."
  exit 1
}

Write-Host "Background assistant started by hidden health check."
Write-Host "Health check task: $HealthTaskName"
Write-Host "Assistant PID(s): $($Running.ProcessId -join ', ')"
Write-Host "Log file: $LogFile"
