param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = Join-Path $env:LOCALAPPDATA 'hermes\node\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $node) { throw 'Node.js was not found. Use the established Torn Veil Node 22 runtime.' }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\tsx\dist\cli.mjs'))) { throw 'Repository dependencies are missing.' }
$bundle = Join-Path $repo '.debug\orbit\visual-bundle'
if ($CheckOnly) {
    Write-Host ('Node: ' + (& $node --version))
    Write-Host ('Private bundle present: ' + (Test-Path -LiteralPath (Join-Path $bundle 'index.html')))
    Write-Host ('Character kit present: ' + (Test-Path -LiteralPath (Join-Path $repo 'web\public\models\kit_f.glb')))
    return
}
Push-Location $repo
try {
    if (-not (Test-Path -LiteralPath (Join-Path $bundle 'index.html'))) {
        & $node node_modules/vite/bin/vite.js build --config vite.web.config.ts --outDir ../.debug/orbit/visual-bundle
        if ($LASTEXITCODE -ne 0) { throw 'Private scene build failed.' }
    }
    & $node --import tsx scripts/web/playable-scene.ts
    if ($LASTEXITCODE -ne 0) { throw 'Playable scene failed; see the error above.' }
} finally { Pop-Location }
