param([switch]$CheckOnly, [int]$Port = 7480)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$expected = 'C:\Users\green\Desktop\projects\torn-veil-online'
if ($repo.TrimEnd('\') -ine $expected) { throw "Use the authoritative checkout: $expected" }
Set-Location -LiteralPath $repo
$root = (& git rev-parse --show-toplevel).Trim().Replace('/', '\')
$remote = (& git remote get-url origin).Trim()
if ($root -ine $expected -or $remote -ne 'https://github.com/scrsper/torn-veil-online.git') { throw 'Repository root/remote mismatch.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid port.' }
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\tsx\dist\cli.mjs'))) { throw 'Run npm ci in the authoritative checkout first.' }
Write-Host 'Observatory uses a disposable in-memory world. Live/staging saves are never opened.'
if ($CheckOnly) { Write-Host 'Preflight passed.'; exit 0 }
$ready = $false
# Preserve an older process and its in-memory world. Open this diagnostic revision on
# another port instead of attaching its new static UI to an older server implementation.
for ($candidate = $Port; $candidate -le [Math]::Min($Port + 10, 65535); $candidate++) {
  $url = "http://127.0.0.1:$candidate"
  try {
    $health = Invoke-RestMethod "$url/health" -TimeoutSec 2
    if ($health.service -ne 'torn-veil-observatory' -or -not $health.isolated) { continue }
    if ($health.diagnosticVersion -ne 2) { Write-Host "Preserving older Observatory on port $candidate."; continue }
    $Port = $candidate; $ready = $true; break
  } catch {
    $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
    if ($listener) { continue }
    $Port = $candidate; break
  }
}
if ($candidate -gt [Math]::Min($Port + 10, 65535)) { throw 'No isolated Observatory port available.' }
if (-not $ready) {
  $logs = Join-Path $repo '.debug\observatory'
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $env:TORN_VEIL_OBSERVATORY_PORT = "$Port"
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdout = Join-Path $logs "server-$stamp.log"
  $stderr = Join-Path $logs "server-$stamp.error.log"
  $process = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'src/observatory/server.ts') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    if ($process.HasExited) { throw "Observatory exited. See $stderr" }
    try { $health = Invoke-RestMethod "$url/health" -TimeoutSec 1; if ($health.service -eq 'torn-veil-observatory' -and $health.isolated) { $ready = $true; break } } catch { }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "Observatory did not become ready. See $stderr" }
  Write-Host "Observatory server PID $($process.Id). Logs: $logs"
}
Start-Process $url
