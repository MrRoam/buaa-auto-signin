param([string]$NodePath)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = if ($NodePath) { $NodePath } else { (Get-Command node).Source }
$Script = Join-Path $Root "src\index.mjs"
$Config = Join-Path $Root "config.json"
$StdOutFile = Join-Path $Root "logs\background.stdout.log"
$StdErrFile = Join-Path $Root "logs\background.stderr.log"

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
Set-Location $Root

$Process = Start-Process -FilePath $Node `
  -ArgumentList @("`"$Script`"", "--config", "`"$Config`"") `
  -WorkingDirectory $Root -WindowStyle Hidden `
  -RedirectStandardOutput $StdOutFile -RedirectStandardError $StdErrFile `
  -Wait -PassThru
exit $Process.ExitCode
