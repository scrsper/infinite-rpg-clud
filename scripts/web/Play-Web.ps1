<#
  Play Torn Veil Web - safe launcher for the browser client.

  What it does, in order:
    1. Preflight (read-only): Node, the built client (dist-web), the client profile, the world
       service's /health, and that the service's config admits the loopback web gateway.
    2. Starts (or reuses) the loopback web gateway for that profile.
    3. Asks the gateway for a one-time launch link and opens it in the default browser.

  What it never does: start, stop, restart, update, reset, back up or otherwise touch the world
  service; edit a world's config; open a second writer; bind anything except 127.0.0.1; print a
  token. If the world is not ready, or does not admit the web gateway, it stops and says why.

  -CheckOnly  run the preflight and report; start nothing.
  -Profile    client profile name (%LOCALAPPDATA%\TornVeil\Client\<name>.json). Default: web-preview,
              the isolated preview world. Pass your own profile to play another world.
  -Port       gateway port (default 7470).
  -Build      run `npm run web:build` first when dist-web is missing or older than the sources.
  -NoBrowser  start the gateway and print nothing but the state; do not open a browser.
#>
param(
    [string]$Profile = 'web-preview',
    [int]$Port = 7470,
    [switch]$CheckOnly,
    [switch]$Build,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$home_ = if ($env:TORN_VEIL_ALPHA_HOME) { $env:TORN_VEIL_ALPHA_HOME } else { Join-Path $env:USERPROFILE 'TornVeilAlpha' }
$problems = New-Object System.Collections.Generic.List[string]
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [note] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [stop] $m" -ForegroundColor Red; $problems.Add($m) }

Write-Host "Play Torn Veil Web - preflight" -ForegroundColor Cyan

# 1. Node ---------------------------------------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Get-ChildItem (Join-Path $home_ 'runtimes\node-*\node.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
if ($node) { Ok "Node: $node" } else { Bad 'Node.js was not found on PATH or under TornVeilAlpha\runtimes.' }
$tsx = Join-Path $repo 'node_modules\tsx\dist\cli.mjs'
if (Test-Path -LiteralPath $tsx) { Ok 'Gateway runner (tsx) is installed.' } else { Bad 'node_modules is missing; run `npm install` in the repository once.' }

# 2. The built client ---------------------------------------------------------------------------
$dist = Join-Path $repo 'dist-web'
$index = Join-Path $dist 'index.html'
$stale = $false
if (Test-Path -LiteralPath $index) {
    $built = (Get-Item -LiteralPath $index).LastWriteTimeUtc
    $newest = Get-ChildItem (Join-Path $repo 'src\web'), (Join-Path $repo 'web\index.html') -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($newest -and $newest.LastWriteTimeUtc -gt $built) { $stale = $true }
}
if ((-not (Test-Path -LiteralPath $index)) -or $stale) {
    if ($Build -and -not $CheckOnly) {
        Write-Host '  building the client (npm run web:build)...'
        Push-Location $repo; try { & npm run web:build; if ($LASTEXITCODE -ne 0) { Bad 'The client build failed; see the output above.' } } finally { Pop-Location }
    } elseif (-not (Test-Path -LiteralPath $index)) {
        Bad 'The web client has not been built. Run `npm run web:build`, or launch with -Build.'
    } else {
        Warn 'dist-web is older than the client sources; launch with -Build to refresh it (playing the older build anyway).'
    }
}
if (Test-Path -LiteralPath $index) {
    if (Test-Path -LiteralPath (Join-Path $dist 'models\kit_f.glb')) { Ok 'Client bundle and character kits are present.' }
    else { Bad 'The character kits are not in dist-web\models. Build them: see docs\web\WEB_ASSETS.md.' }
}

# 3. Profile ------------------------------------------------------------------------------------
if ($Profile -notmatch '^[A-Za-z0-9_-]+$') { Bad 'Profile names are letters, digits, - and _.' }
$profileFile = Join-Path $env:LOCALAPPDATA "TornVeil\Client\$Profile.json"
$server = $null; $upHost = $null; $upPort = 0
if (Test-Path -LiteralPath $profileFile) {
    $p = Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
    if ($p.server -and $p.account -and $p.token) {
        $server = [string]$p.server
        $upHost, $upPortText = $server.Split(':'); $upPort = [int]$upPortText
        if ($upHost -in @('127.0.0.1', 'localhost', '::1')) { Ok "Profile '$Profile' -> $server (account $($p.account); credential not shown)." }
        else { Bad "Profile '$Profile' points at $server. The web gateway only connects to a loopback world service." }
    } else { Bad "Profile '$Profile' needs server, account and token." }
} else { Bad "Client profile not found: $profileFile" }

# 4. World service ------------------------------------------------------------------------------
$envName = $null; $releaseText = ''
if ($server -and $upPort -gt 0) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$upPort/health" -TimeoutSec 4
        $envName = $health.env; $releaseText = "$($health.release)"
        if ($health.state -eq 'ready') { Ok "World service on :$upPort is ready (env $envName, release $releaseText)." }
        else { Bad "World service on :$upPort reports '$($health.state)'. Wait until it is ready; this launcher will not start or repair it." }
    } catch { Bad "No world service is answering on 127.0.0.1:$upPort. Start that world with its own operator command first; this launcher never starts a world." }
}

# 5. Does that world admit the web gateway? -----------------------------------------------------
if ($envName) {
    $candidates = @(
        (Join-Path $home_ "$envName\config.json"),
        (Join-Path $home_ "web-preview\$envName\config.json")
    ) | Where-Object { Test-Path -LiteralPath $_ }
    $matched = $null
    foreach ($c in $candidates) {
        $cfg = Get-Content -LiteralPath $c -Raw | ConvertFrom-Json
        $cfgPort = if ($cfg.port) { [int]$cfg.port } else { switch ($cfg.env) { 'live' { 7400 } 'staging' { 7410 } default { 7420 } } }
        if ($cfgPort -eq $upPort) { $matched = $cfg; break }
    }
    if ($null -eq $matched) { Warn "Could not locate the config for :$upPort to confirm it admits the web gateway; the sign-in will be refused if it does not." }
    elseif ($matched.webGateway -eq $true) { Ok 'That world is configured to admit the loopback web gateway.' }
    else { Bad 'That world does not admit the web gateway (its config lacks "webGateway": true). Enabling it is an operator decision on that world; this launcher will not change it.' }
    if ($envName -in @('live', 'staging')) { Warn "This is the $envName world. Web play follows the same takeover policy as the Unreal client: signing in from the browser takes over the account if another client holds it." }
}

# 6. Gateway port -------------------------------------------------------------------------------
$stateDir = Join-Path $home_ $(if ($Port -eq 7470) { 'web-gateway' } else { "web-gateway-$Port" })
$stateFile = Join-Path $stateDir 'gateway.json'
$reuse = $null
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $st = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
    if ($st -and $st.pid -eq $listener.OwningProcess -and $st.profile -eq $Profile -and $st.port -eq $Port) { $reuse = $st; Ok "A gateway for '$Profile' is already running on :$Port (pid $($st.pid)); it will be reused." }
    else { Bad "Port $Port is in use by something that is not this profile's web gateway. Choose another with -Port." }
} else { Ok "Gateway port $Port is free (bound to 127.0.0.1 only)." }

if ($problems.Count -gt 0) {
    Write-Host ''
    Write-Host "Not launching: $($problems.Count) preflight problem(s) above. Nothing was started or changed." -ForegroundColor Red
    exit 1
}
if ($CheckOnly) { Write-Host ''; Write-Host 'Preflight passed. -CheckOnly: no gateway or browser was started.' -ForegroundColor Green; return }

# 7. Gateway + launch link ----------------------------------------------------------------------
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
if (-not $reuse) {
    $log = Join-Path $stateDir 'gateway.log'
    $args_ = @($tsx, (Join-Path $repo 'src\webgate\main.ts'), '--profile', $Profile, '--port', "$Port", '--static', $dist, '--state-dir', $stateDir)
    $t0 = (Get-Date).ToUniversalTime().AddSeconds(-1)
    # tsx runs the gateway in a child process, so ready is recognised by the state file it writes, not by this pid.
    $proc = Start-Process -FilePath $node -ArgumentList $args_ -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError (Join-Path $stateDir 'gateway.err.log') -PassThru
    $deadline = (Get-Date).AddSeconds(20); $st = $null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 300
        if ($proc.HasExited) { throw "The gateway exited during start-up; see $(Join-Path $stateDir 'gateway.err.log')." }
        if (Test-Path -LiteralPath $stateFile) {
            $cand = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
            if ($cand.port -eq $Port -and $cand.profile -eq $Profile -and ([datetime]$cand.startedAtIso).ToUniversalTime() -ge $t0) { $st = $cand; break }
        }
    }
    if (-not $st) { throw 'The gateway did not report ready within 20 seconds.' }
    $reuse = $st
    Ok "Gateway started on $($st.origin)."
}
$resp = Invoke-RestMethod -Method Post -Uri "$($reuse.origin)/api/operator/launch" -Headers @{ 'x-torn-veil-gateway-operator' = $reuse.operator } -TimeoutSec 5
if ($NoBrowser) { Write-Host 'Gateway is ready; -NoBrowser: no link opened.'; return }
Write-Host 'Opening the game in your default browser (a WebGPU-capable Chrome or Edge is recommended)...' -ForegroundColor Cyan
Start-Process $resp.url
Write-Host 'The launch link is single-use and expires in two minutes. To stop the gateway later, close its process (pid in web-gateway\gateway.json); the world service is unaffected.'
