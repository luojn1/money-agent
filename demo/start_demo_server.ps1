$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$Candidates = @(
  "$env:USERPROFILE\anaconda3\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "python"
)

$PythonExe = $null
foreach ($Candidate in $Candidates) {
  if ($Candidate -eq "python") {
    $Cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($Cmd) {
      $PythonExe = $Cmd.Source
      break
    }
  } elseif (Test-Path $Candidate) {
    $PythonExe = $Candidate
    break
  }
}

if (-not $PythonExe) {
  Write-Host "Python was not found. Please install Python or Anaconda first." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "Money Agent local demo server" -ForegroundColor Green
Write-Host ""
Write-Host "Project root:"
Write-Host "  $Root"
Write-Host ""
Write-Host "Open this URL after the server starts:"
Write-Host "  http://127.0.0.1:8091/demo/index.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "Keep this window open while using the page."
Write-Host ""

& $PythonExe demo\demo_server.py --host 127.0.0.1 --port 8091

Write-Host ""
Write-Host "Server stopped or failed to start." -ForegroundColor Yellow
Read-Host "Press Enter to close"
