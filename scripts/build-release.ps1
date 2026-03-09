param(
  [switch]$SkipClean,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Remove-PathIfExists {
  param([string]$PathToRemove)
  if (Test-Path -LiteralPath $PathToRemove) {
    Remove-Item -LiteralPath $PathToRemove -Recurse -Force
  }
}

function Invoke-CheckedCommand {
  param(
    [string]$Command,
    [string[]]$CommandArgs
  )

  & $Command @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($CommandArgs -join ' ')"
  }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $projectRoot "dist"
$tauriDir = Join-Path $projectRoot "src-tauri"
$targetDir = Join-Path $tauriDir "target"
$tauriReleaseDir = Join-Path $targetDir "release"
$bundleDir = Join-Path $tauriReleaseDir "bundle"
$releaseDir = Join-Path $projectRoot "release"
$npmExecutable = if ($env:OS -eq "Windows_NT") { "npm.cmd" } else { "npm" }

Set-Location $projectRoot

if (-not $SkipClean) {
  Write-Step "Cleaning frontend and Rust build cache"
  Remove-PathIfExists $distDir
  Remove-PathIfExists $releaseDir
  Invoke-CheckedCommand "cargo" @("clean", "--manifest-path", "src-tauri/Cargo.toml")
}

if ($SkipBuild) {
  Write-Step "Build skipped"
  exit 0
}

Write-Step "Building production app with Tauri"
Invoke-CheckedCommand $npmExecutable @("run", "tauri", "--", "build")

Write-Step "Collecting artifacts into release directory"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$hasCollectedArtifacts = $false

if (Test-Path -LiteralPath $distDir) {
  Copy-Item -LiteralPath $distDir -Destination (Join-Path $releaseDir "dist") -Recurse -Force
  $hasCollectedArtifacts = $true
}

if (Test-Path -LiteralPath $bundleDir) {
  Copy-Item -LiteralPath $bundleDir -Destination (Join-Path $releaseDir "bundle") -Recurse -Force
  $hasCollectedArtifacts = $true
}

$exeFiles = @()
if (Test-Path -LiteralPath $tauriReleaseDir) {
  $exeFiles = Get-ChildItem -LiteralPath $tauriReleaseDir -File -Filter "*.exe"
}

if ($exeFiles.Count -gt 0) {
  $binDir = Join-Path $releaseDir "bin"
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  foreach ($exe in $exeFiles) {
    Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $binDir $exe.Name) -Force
  }
  $hasCollectedArtifacts = $true
}

if (-not $hasCollectedArtifacts) {
  throw "No build artifacts were found. Expected output under dist/ or src-tauri/target/release."
}

$artifactListPath = Join-Path $releaseDir "ARTIFACTS.txt"
$artifactLines = Get-ChildItem -LiteralPath $releaseDir -Recurse -File |
  ForEach-Object {
    $_.FullName.Substring($projectRoot.Length + 1)
  } |
  Sort-Object
$artifactLines | Set-Content -LiteralPath $artifactListPath -Encoding utf8

Write-Step "Done. Artifacts are available at: $releaseDir"
