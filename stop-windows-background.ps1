$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "IClassStandaloneSigninAssistantHidden"
$LegacyTaskName = "IClassStandaloneSigninAssistant"
$HealthTaskName = "IClassStandaloneSigninAssistantHealthCheck"
$PidFile = Join-Path $Root "state\background.pid"

function Get-AssistantProcess {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "src[\\/]index\.mjs" -and
      $_.CommandLine -match [regex]::Escape($Root) -and
      $_.CommandLine -notmatch "--once"
    }
}

$Stopped = $false
$HealthTask = Get-ScheduledTask -TaskName $HealthTaskName -ErrorAction SilentlyContinue
if ($HealthTask -and $HealthTask.State -eq "Running") {
  Stop-ScheduledTask -TaskName $HealthTaskName
  $Stopped = $true
}

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task -and $Task.State -eq "Running") {
  Stop-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  $Stopped = $true
}

$LegacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
if ($LegacyTask -and $LegacyTask.State -eq "Running") {
  Stop-ScheduledTask -TaskName $LegacyTaskName
  Start-Sleep -Seconds 2
  $Stopped = $true
}

$Processes = @(Get-AssistantProcess)
foreach ($Process in $Processes) {
  Stop-Process -Id $Process.ProcessId -Force
  Write-Host "Stopped assistant process. PID: $($Process.ProcessId)"
  $Stopped = $true
}

if (Test-Path $PidFile) {
  try {
    $PidText = Get-Content -Path $PidFile -Raw
    $BackgroundPid = [int]($PidText.Trim())
    $Process = Get-Process -Id $BackgroundPid -ErrorAction SilentlyContinue
    if ($Process) {
      Stop-Process -Id $BackgroundPid -Force
      Write-Host "Stopped legacy hidden background process. PID: $BackgroundPid"
      $Stopped = $true
    }
  } finally {
    Remove-Item -Path $PidFile -Force
  }
}

if ($Task) {
  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-Host "Windows scheduled task state: $($Task.State)"
  Write-Host "Note: this task will still start after the next Windows login."
  Write-Host "To remove autostart, run: Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false"
}

if (-not $Stopped) {
  Write-Host "No running background task or hidden background process found."
}
