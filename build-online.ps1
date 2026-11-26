#requires -Version 5.1
<#
.SYNOPSIS
    Build the lean PROCURE360 v2 Windows bundle (dependencies installed by Setup).

.DESCRIPTION
    Assembles source, prebuilt frontend and compiled service host. No Python
    runtime or site-packages are bundled. Setup.cmd finds system Python, pip
    installs dependencies and writes runtime\launch.conf.

.EXAMPLE
    .\build-online.ps1
#>
[CmdletBinding()]
param(
    [string]$OutputZip = (Join-Path $env:USERPROFILE 'Downloads\PROCURE360-v2.zip'),
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$stagingParent = Join-Path $env:TEMP 'p360v2build'
$staging = Join-Path $stagingParent 'PROCURE360'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

function Write-Step { param([string]$m) Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "  OK  $m" -ForegroundColor Green }
function Copy-Tree {
    param([string]$Source, [string]$Destination, [string[]]$ExcludeDirs = @(), [string[]]$ExcludeFiles = @())
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $copyArgs = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs.Count -gt 0) { $copyArgs += '/XD'; $copyArgs += $ExcludeDirs }
    if ($ExcludeFiles.Count -gt 0) { $copyArgs += '/XF'; $copyArgs += $ExcludeFiles }
    & robocopy @copyArgs | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "robocopy failed for $Source (exit $LASTEXITCODE)." }
}

Write-Host ''
Write-Host '  PROCURE360 v2 - online-install bundle builder' -ForegroundColor White
Write-Host ''

if (-not (Test-Path -LiteralPath $csc)) { throw "C# compiler not found at $csc." }
if (-not (Test-Path -LiteralPath (Join-Path $project 'frontend\dist\index.html'))) {
    throw 'frontend\dist\index.html is missing. Run npm run build in frontend first.'
}

Write-Step 'Cleaning the staging folder'
if (Test-Path -LiteralPath $stagingParent) { Remove-Item -LiteralPath $stagingParent -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Write-Step 'Copying application source'
Copy-Tree -Source (Join-Path $project 'backend') -Destination (Join-Path $staging 'backend') `
    -ExcludeDirs @('__pycache__', '.pytest_cache', '.mypy_cache') `
    -ExcludeFiles @('*.pyc', '*.db', '.env', 'install.log', 'Dockerfile', '.dockerignore', 'docker-entrypoint.sh')
Copy-Tree -Source (Join-Path $project 'frontend\dist') -Destination (Join-Path $staging 'frontend\dist')
Write-Ok 'Backend and prebuilt frontend copied'

Write-Step 'Compiling the service host'
$serviceDir = Join-Path $staging 'service'
New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
& $csc /nologo /target:exe /platform:x64 /optimize+ `
    "/out:$serviceDir\procure360-service.exe" /r:System.ServiceProcess.dll `
    (Join-Path $project 'service\Procure360Service.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile the Windows service host.' }
Copy-Item -LiteralPath (Join-Path $project 'service\Procure360Service.cs') -Destination $serviceDir
Write-Ok 'Service host compiled'

Write-Step 'Copying installer and documentation'
$files = @(
    @{ From = 'install-online.ps1'; To = 'install.ps1' },
    @{ From = 'Setup.cmd'; To = 'Setup.cmd' },
    @{ From = 'uninstall.ps1'; To = 'uninstall.ps1' },
    @{ From = 'Uninstall.cmd'; To = 'Uninstall.cmd' },
    @{ From = 'Start PROCURE360.cmd'; To = 'Start PROCURE360.cmd' },
    @{ From = 'README-v2.md'; To = 'README.md' },
    @{ From = '.env.example'; To = '.env.example' }
)
foreach ($f in $files) {
    $src = Join-Path $project $f.From
    if (-not (Test-Path -LiteralPath $src)) { throw "Missing source file: $src" }
    Copy-Item -LiteralPath $src -Destination (Join-Path $staging $f.To)
}

# The manual launcher must use system Python now (no bundled runtime).
$startScript = @"
@echo off
setlocal
title PROCURE360
cd /d "%~dp0"
set "PYTHONPATH=%~dp0backend;%~dp0runtime\system-site-packages"
powershell.exe -NoProfile -Command "`$c = '%~dp0runtime\launch.conf'; if (Test-Path `$c) { `$p = (Get-Content `$c | Where-Object { `$_ -like 'python=*' } | Select-Object -First 1) -replace '^python=', ''; if (`$p) { & `$p '%~dp0backend\run_server.py'; exit `$LASTEXITCODE } }; `$py = Get-Command py -ErrorAction SilentlyContinue; if (`$py) { & py -3 '%~dp0backend\run_server.py'; exit `$LASTEXITCODE }; `$python = Get-Command python -ErrorAction SilentlyContinue; if (`$python) { & python '%~dp0backend\run_server.py'; exit `$LASTEXITCODE }; Write-Host 'No Python found. Run Setup.cmd first.'; exit 1"
echo.
echo PROCURE360 stopped.
pause
"@
[IO.File]::WriteAllText((Join-Path $staging 'Start PROCURE360.cmd'), ($startScript -replace "`n", "`r`n"), (New-Object Text.UTF8Encoding($false)))
Write-Ok 'Installer files copied'

Write-Step 'Validating the bundle'
$required = @(
    (Join-Path $staging 'install.ps1'),
    (Join-Path $staging 'Setup.cmd'),
    (Join-Path $staging 'backend\run_server.py'),
    (Join-Path $staging 'backend\requirements.txt'),
    (Join-Path $staging 'frontend\dist\index.html'),
    (Join-Path $staging 'service\procure360-service.exe'),
    (Join-Path $staging '.env.example')
)
foreach ($p in $required) { if (-not (Test-Path -LiteralPath $p)) { throw "Missing in bundle: $p" } }
if (Test-Path -LiteralPath (Join-Path $staging '.env')) { throw 'Bundle contains .env' }
if (Get-ChildItem -LiteralPath $staging -Recurse -Filter '*.db' -ErrorAction SilentlyContinue) { throw 'Bundle contains a database' }
if (Test-Path -LiteralPath (Join-Path $staging 'runtime\python')) { throw 'Bundle must not contain bundled Python (v2 installs during setup)' }
Write-Ok 'Validation passed'

Write-Step 'Writing the zip'
$zipDir = Split-Path -Parent $OutputZip
if (-not (Test-Path -LiteralPath $zipDir)) { New-Item -ItemType Directory -Path $zipDir -Force | Out-Null }
if (Test-Path -LiteralPath $OutputZip) { Remove-Item -LiteralPath $OutputZip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($OutputZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $prefixLength = $stagingParent.Length + 1
    foreach ($file in Get-ChildItem -LiteralPath $stagingParent -Recurse -File) {
        $relative = $file.FullName.Substring($prefixLength).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }

$info = Get-Item -LiteralPath $OutputZip
$hash = (Get-FileHash -LiteralPath $OutputZip -Algorithm SHA256).Hash
$archive = [IO.Compression.ZipFile]::OpenRead($OutputZip)
try { $files = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') }) } finally { $archive.Dispose() }

Write-Host ''
Write-Host "Bundle:  $($info.FullName)" -ForegroundColor Green
Write-Host "Size:    $([Math]::Round($info.Length / 1MB, 2)) MB"
Write-Host "Files:   $($files.Count)"
Write-Host "SHA256:  $hash"
Write-Host ''
Write-Host 'Checks:' -ForegroundColor Cyan
Write-Host "  bundled Python:  $([bool]($files | Where-Object FullName -like '*/runtime/python/*'))"
Write-Host "  .env:            $([bool]($files | Where-Object FullName -match '(?i)(^|/)\.env$'))"
Write-Host "  database:        $([bool]($files | Where-Object FullName -match '(?i)\.(db|sqlite)$'))"
Write-Host "  service exe:     $([bool]($files | Where-Object FullName -eq 'PROCURE360/service/procure360-service.exe'))"
Write-Host "  frontend:        $([bool]($files | Where-Object FullName -eq 'PROCURE360/frontend/dist/index.html'))"
Write-Host ''

if (-not $KeepStaging) {
    Remove-Item -LiteralPath $stagingParent -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Staging folder removed.' -ForegroundColor DarkGray
} else {
    Write-Host "Staging kept at: $staging" -ForegroundColor DarkGray
}