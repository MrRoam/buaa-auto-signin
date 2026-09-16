$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Join-Path $Root "config.json"
$SetupScript = Join-Path $Root "src\setup.mjs"
$StartScript = Join-Path $Root "start-windows-background.ps1"

try {
  Write-Host ""
  Write-Host "BUAA iClass Sign-in Assistant" -ForegroundColor Cyan
  Write-Host "======================" -ForegroundColor Cyan
  Write-Host ""

  $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$env:Path;$MachinePath;$UserPath"
  $Node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $Node) {
    $CommonNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path -LiteralPath $CommonNode) {
      $env:Path = "$(Split-Path -Parent $CommonNode);$env:Path"
      $Node = Get-Command node.exe -ErrorAction SilentlyContinue
    }
  }

  if (-not $Node) {
    Write-Host "Node.js is required but was not found." -ForegroundColor Yellow
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $Winget) {
      Write-Host "Install Node.js LTS from https://nodejs.org/ and run this file again." -ForegroundColor Yellow
      exit 1
    }

    $Answer = Read-Host "Install Node.js LTS automatically now? Enter y to continue"
    if ($Answer -notmatch '^(y|yes)$') {
      Write-Host "Cancelled. Install Node.js and run this file again."
      exit 1
    }

    Write-Host "Installing Node.js LTS with Windows Package Manager..."
    & $Winget.Source install --id OpenJS.NodeJS.LTS --exact `
      --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw "Node.js installation failed (winget exit code $LASTEXITCODE). Install it from https://nodejs.org/."
    }

    $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$MachinePath;$UserPath"
    $Node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $Node) {
      $CommonNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
      if (Test-Path -LiteralPath $CommonNode) {
        $env:Path = "$(Split-Path -Parent $CommonNode);$env:Path"
        $Node = Get-Command node.exe -ErrorAction SilentlyContinue
      }
    }
    if (-not $Node) {
      throw "Node.js was installed but is not available yet. Close this window and run run-windows.bat again."
    }
  }

  $VersionText = & $Node.Source --version
  $MajorVersion = [int](($VersionText -replace '^v', '').Split('.')[0])
  if ($MajorVersion -lt 18) {
    throw "Node.js $VersionText is too old. Install Node.js 18 or newer."
  }
  Write-Host "Node.js $VersionText is ready." -ForegroundColor Green

  if (-not (Test-Path -LiteralPath $Config)) {
    Write-Host ""
    Write-Host "First run: enter your student ID and password. Password input is hidden." -ForegroundColor Cyan
    & $Node.Source $SetupScript
    if ($LASTEXITCODE -ne 0) {
      throw "Account setup did not complete."
    }
  } else {
    Write-Host "Local configuration found. Run npm run setup to change the account."
  }

  Write-Host ""
  Write-Host "Installing and starting the Windows background task..."
  & $StartScript
  if ($LASTEXITCODE -ne 0) {
    throw "The background task failed to start."
  }
  exit 0
} catch {
  Write-Host ""
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
