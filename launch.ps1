$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Join-Path $repoRoot 'backend'
$frontendRoot = Join-Path $repoRoot 'frontend'
$pythonPath = Join-Path $backendRoot 'venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  Write-Host 'Creating backend virtual environment...' -ForegroundColor Cyan
  & python -m venv (Join-Path $backendRoot 'venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python 3 is required to create the backend environment.' }
}

Write-Host 'Installing backend dependencies...' -ForegroundColor Cyan
& $pythonPath -m pip install -r (Join-Path $backendRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }

if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules'))) {
  Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
  Push-Location $frontendRoot
  npm ci
  $frontendInstallExit = $LASTEXITCODE
  Pop-Location
  if ($frontendInstallExit -ne 0) { throw 'Frontend dependency installation failed.' }
}

$backendCommand = "Set-Location -LiteralPath '$backendRoot'; & '$pythonPath' -m uvicorn main:app --reload --host 127.0.0.1 --port 7000"
Start-Process powershell.exe -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand) | Out-Null

Write-Host 'API started at http://localhost:7000' -ForegroundColor Green
Write-Host 'Starting Next.js at http://localhost:5000' -ForegroundColor Green
Push-Location $frontendRoot
npm run dev -- -p 5000
Pop-Location
