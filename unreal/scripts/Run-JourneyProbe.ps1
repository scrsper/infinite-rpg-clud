param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$Profile,
    [Parameter(Mandatory=$true)][string]$Out,
    [Parameter(Mandatory=$true)][string]$TargetBody,
    [string[]]$Dialogue = @('Trade','Buy bread|Buy meat|Buy cheese|Buy stew'),
    [switch]$ObserveOnly,
    # Waypoints ({x,z,label} canonical metres) to walk when nobody new is in view: disclosed route knowledge.
    [string]$RouteFile = '',
    [string]$Executable = 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe',
    [ValidateRange(640,3840)][int]$Width = 1920,
    [ValidateRange(480,2160)][int]$Height = 1080,
    [ValidateRange(60,1200)][int]$TimeoutSeconds = 420,
    # Stay in the shared world this long after the journey (walking the route with -HoldWalk),
    # recording our own path and every body shown to us, for two-client cross-checks.
    [ValidateRange(0,900)][int]$HoldSeconds = 0,
    [switch]$HoldWalk,
    # Press the walk toggle on entering: go about at a walk instead of the default run.
    [switch]$Walk,
    # With -ObserveOnly: a JSON list of locomotion showcase segments {label,seconds,hold[],tap[],axes{}}.
    [string]$ShowcaseFile = '',
    # Run with the audio device (the report then says what the soundscape actually played).
    [switch]$WithSound,
    # Walk the route's named places before asking anyone; there ask only people this close.
    [switch]$RouteFirst,
    [ValidateRange(0,100)][double]$NearRadiusMetres = 0,
    # Record evidence video (TV.Record) from entering the world; encoded to <Out>/journey.mp4.
    [ValidateRange(0,60)][int]$RecordFps = 0,
    # With -ObserveOnly: TV.Lineup of the player and this many people in all (<Out>/lineup.png).
    [ValidateRange(-1,12)][int]$Lineup = 0 # -1: one clone of the player per activity clip
)
# Automated ordinary-input journey (TV.JourneyProbe). Real rendering; credentials stay in the
# client profile. The config names who to walk to, so a pass is not a discoverability claim.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$Out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
if (Test-Path -LiteralPath $Out) { throw "Refusing to reuse journey evidence: $Out" }
New-Item -ItemType Directory -Path $Out | Out-Null
$config = [ordered]@{ out = $Out; targetBody = $TargetBody; dialogue = $Dialogue; eat = !$ObserveOnly; observeOnly = [bool]$ObserveOnly; quit = $true; timeoutSeconds = $TimeoutSeconds - 60; holdSeconds = $HoldSeconds; holdWalk = [bool]$HoldWalk; walk = [bool]$Walk; routeFirst = [bool]$RouteFirst; nearRadiusMetres = $NearRadiusMetres; recordFps = $RecordFps; lineup = $Lineup }
if ($ShowcaseFile) { $config.showcase = @(Get-Content -LiteralPath $ShowcaseFile -Raw | ConvertFrom-Json) }
if ($RouteFile) { $config.explore = @(Get-Content -LiteralPath $RouteFile -Raw | ConvertFrom-Json) }
$configFile = Join-Path $Out 'config.json'
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configFile -Encoding utf8
$arguments = @()
if ([IO.Path]::GetFileName($Executable) -like 'UnrealEditor*') {
    $arguments += '"' + (Join-Path $repo 'unreal/TornVeilOnline/TornVeilOnline.uproject') + '"'
    $arguments += @('/Game/TornVeil/Maps/TornVeilWorld','-game')
}
if (!$WithSound) { $arguments += '-nosound' }
$arguments += @('-RenderOffscreen','-unattended','-nosplash','-windowed','-ForceRes', ('-ResX='+$Width), ('-ResY='+$Height),
    ('-TVProfile='+$Profile), ('-abslog="'+(Join-Path $Out 'unreal.log')+'"'),
    ('-ExecCmds="t.MaxFPS 60,t.IdleWhenNotForeground 0,TV.JourneyProbe '+$configFile+'"'))
$start = [DateTime]::UtcNow
$job = Start-Process -FilePath $Executable -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru
Write-Output "Journey PID=$($job.Id) output=$Out timeout=${TimeoutSeconds}s"
if (!$job.WaitForExit($TimeoutSeconds * 1000)) { Stop-Process -Id $job.Id -ErrorAction SilentlyContinue; throw "Journey timed out: $Out" }
$report = Join-Path $Out 'journey.json'
if (!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTimeUtc -lt $start) { throw "No fresh journey report: $Out" }
$result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$frames = Join-Path $Out 'video'
if ($RecordFps -gt 0 -and (Test-Path (Join-Path $frames 'frame_00000.jpg'))) {
    Start-Sleep 2 # the last JPEGs are written on worker threads as the game quits
    & ffmpeg -loglevel error -y -framerate $RecordFps -i (Join-Path $frames 'frame_%05d.jpg') -vf 'scale=1280:-2' -c:v libx264 -pix_fmt yuv420p -crf 20 (Join-Path $Out 'journey.mp4')
    Write-Output "Video: $(Join-Path $Out 'journey.mp4') ($((Get-ChildItem $frames -Filter *.jpg).Count) frames at $RecordFps fps)"
}
Write-Output "Journey $($result.status) in $([Math]::Round($result.elapsedSeconds,1)) s ($($result.steps.Count) steps; frames still require review): $report"
if ($result.status -ne 'passed') { throw "Journey failed: $($result.error)" }
