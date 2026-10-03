param([switch]$SkipReplay, [string]$OutputRoot = '.debug/observatory-hardening/new-validation', [string]$PrimaryRun = '.debug/observatory-hardening/reviewed-918271')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ($repo -ine 'C:\Users\green\Desktop\projects\torn-veil-online') { throw 'Use the authoritative checkout.' }
Set-Location -LiteralPath $repo
$primary = $PrimaryRun
$evidence = $OutputRoot
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
function Invoke-RecordedNode([string]$Label, [string[]]$NodeArguments) {
  Write-Output "Starting $Label"
  & node @NodeArguments > "$evidence/$Label.log" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$Label failed; inspect $evidence/$Label.log" }
  Write-Output "Completed $Label"
}
# The first continuous run is deliberately separate, so its findings can be reviewed first.
if (-not (Test-Path -LiteralPath "$primary/report.json")) { throw 'Complete and review the repaired 30-day run first.' }
if (-not $SkipReplay) {
  Invoke-RecordedNode 'continuation-918271' @('--import', 'tsx', 'scripts/observatory/audit.ts', '--days=15', '--seed=918271', "--input=$primary/day-15.save.json.gz", "--out=$evidence/continuation-918271", '--capture=false')
  Invoke-RecordedNode 'continuation-comparison' @('scripts/observatory/compare-saves.mjs', "$primary/final.save.json.gz", "$evidence/continuation-918271/final.save.json.gz", "$evidence/continuation-diff.json.gz")
  Invoke-RecordedNode 'repeat-918271' @('--import', 'tsx', 'scripts/observatory/audit.ts', '--days=30', '--seed=918271', "--out=$evidence/repeat-918271", '--capture=false')
  foreach ($day in @(1, 7, 30)) {
    Invoke-RecordedNode "repeat-comparison-$day" @('scripts/observatory/compare-saves.mjs', "$primary/day-$day.save.json.gz", "$evidence/repeat-918271/day-$day.save.json.gz", "$evidence/repeat-day-$day-diff.json.gz")
  }
}
foreach ($seed in @(918272, 918273)) {
  Invoke-RecordedNode "repaired-$seed" @('--import', 'tsx', 'scripts/observatory/audit.ts', '--days=30', "--seed=$seed", "--out=$evidence/repaired-$seed")
  Invoke-RecordedNode "extract-$seed" @('--import', 'tsx', 'scripts/observatory/extract-audit.ts', "$evidence/repaired-$seed")
  Invoke-RecordedNode "analysis-$seed" @('--import', 'tsx', 'scripts/observatory/explain-run.ts', "$evidence/repaired-$seed")
  Invoke-RecordedNode "health-review-$seed" @('--import', 'tsx', 'scripts/observatory/review-health.ts', "$evidence/repaired-$seed")
}
Write-Output 'All requested isolated horizons and replay comparisons completed. Review hourly findings and outcome reports before claiming acceptance.'
