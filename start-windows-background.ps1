$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainTaskName = "IClassStandaloneSigninAssistantHidden"
$InstallScript = Join-Path $Root "install-windows-task.ps1"
$EnsureScript = Join-Path $Root "ensure-windows-background.ps1"
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

& $InstallScript
Enable-ScheduledTask -TaskName $MainTaskName | Out-Null

$Running = @(Get-AssistantProcess)
if ($Running.Count -gt 0) {
  Write-Host "Background assistant is already running. PID(s): $($Running.ProcessId -join ', ')"
  Write-Host "Log file: $LogFile"
  exit 0
}

$MainTask = Get-ScheduledTask -TaskName $MainTaskName -ErrorAction SilentlyContinue
if (-not $MainTask) {
  try {
    & $InstallScript
    $MainTask = Get-ScheduledTask -TaskName $MainTaskName -ErrorAction Stop
  } catch {
    Write-Host "Cannot create Windows scheduled task."
    Write-Host "Reason: $($_.Exception.Message)"
    exit 1
  }
}

Start-ScheduledTask -TaskName $MainTaskName
for ($Attempt = 0; $Attempt -lt 15; $Attempt++) {
  Start-Sleep -Seconds 2
  $Running = @(Get-AssistantProcess)
  if ($Running.Count -gt 0) { break }
}

if ($Running.Count -eq 0) {
  # 兜底：少数情况下计划任务实例未按预期接管，直接以隐藏窗口拉起 Node。
  & $EnsureScript
  for ($Attempt = 0; $Attempt -lt 5; $Attempt++) {
    Start-Sleep -Seconds 2
    $Running = @(Get-AssistantProcess)
    if ($Running.Count -gt 0) { break }
  }
}

if ($Running.Count -eq 0) {
  Write-Host "Background assistant did not start."
  Write-Host "See logs: $LogFile"
  exit 1
}

Write-Host "Background assistant started."
Write-Host "Scheduled task: $MainTaskName"
Write-Host "Assistant PID(s): $($Running.ProcessId -join ', ')"
Write-Host "Log file: $LogFile"
