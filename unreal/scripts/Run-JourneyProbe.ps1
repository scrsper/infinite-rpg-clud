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
    [ValidateRange(60,1200)][int]$TimeoutSeconds = 420
)
# Automated ordinary-input journey (TV.JourneyProbe). Real rendering; credentials stay in the
# client profile. The config names who to walk to, so a pass is not a discoverability claim.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$Out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
if (Test-Path -LiteralPath $Out) { throw "Refusing to reuse journey evidence: $Out" }
New-Item -ItemType Directory -Path $Out | Out-Null
$config = [ordered]@{ out = $Out; targetBody = $TargetBody; dialogue = $Dialogue; eat = !$ObserveOnly; observeOnly = [bool]$ObserveOnly; quit = $true; timeoutSeconds = $TimeoutSeconds - 60 }
if ($RouteFile) { $config.explore = @(Get-Content -LiteralPath $RouteFile -Raw | ConvertFrom-Json) }
$configFile = Join-Path $Out 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding utf8
$arguments = @()
if ([IO.Path]::GetFileName($Executable) -like 'UnrealEditor*') {
    $arguments += '"' + (Join-Path $repo 'unreal/TornVeilOnline/TornVeilOnline.uproject') + '"'
    $arguments += @('/Game/TornVeil/Maps/TornVeilWorld','-game')
}
$arguments += @('-RenderOffscreen','-unattended','-nosplash','-nosound','-windowed','-ForceRes', ('-ResX='+$Width), ('-ResY='+$Height),
    ('-TVProfile='+$Profile), ('-abslog="'+(Join-Path $Out 'unreal.log')+'"'),
    ('-ExecCmds="t.MaxFPS 60,t.IdleWhenNotForeground 0,TV.JourneyProbe '+$configFile+'"'))
$start = [DateTime]::UtcNow
$job = Start-Process -FilePath $Executable -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru
Write-Output "Journey PID=$($job.Id) output=$Out timeout=${TimeoutSeconds}s"
if (!$job.WaitForExit($TimeoutSeconds * 1000)) { Stop-Process -Id $job.Id -ErrorAction SilentlyContinue; throw "Journey timed out: $Out" }
$report = Join-Path $Out 'journey.json'
if (!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTimeUtc -lt $start) { throw "No fresh journey report: $Out" }
$result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
Write-Output "Journey $($result.status) in $([Math]::Round($result.elapsedSeconds,1)) s ($($result.steps.Count) steps; frames still require review): $report"
if ($result.status -ne 'passed') { throw "Journey failed: $($result.error)" }
