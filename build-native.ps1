#requires -Version 5.1
<#
.SYNOPSIS
    Build the Docker-free PROCURE360 Windows bundle.

.DESCRIPTION
    Builds the Vite frontend, assembles the embedded Python runtime, compiles
    the tiny Windows service host, copies the backend/installer and writes the
    empty handoff zip (no users, database or demo data).

.EXAMPLE
    .\build-native.ps1

.EXAMPLE
    .\build-native.ps1 -OutputZip C:\Temp\PROCURE360-empty.zip -SkipFrontend
#>
[CmdletBinding()]
param(
    [string]$OutputZip = (Join-Path $env:USERPROFILE 'Downloads\PROCURE360-empty.zip'),
    [switch]$SkipFrontend,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$cache = Join-Path $env:TEMP 'procure360-native-cache'
$stagingParent = Join-Path $env:TEMP 'p360build'
$staging = Join-Path $stagingParent 'PROCURE360'
$pythonVersion = '3.14.7'
$pythonZip = Join-Path $cache "python-$pythonVersion-embed-amd64.zip"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "      $Message" -ForegroundColor Gray
}

function Copy-Tree {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirs = @(),
        [string[]]$ExcludeFiles = @()
    )
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $copyArgs = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs.Count -gt 0) {
        $copyArgs += '/XD'
        $copyArgs += $ExcludeDirs
    }
    if ($ExcludeFiles.Count -gt 0) {
        $copyArgs += '/XF'
        $copyArgs += $ExcludeFiles
    }
    & robocopy @copyArgs | Out-Null
    $code = $LASTEXITCODE
    if ($code -gt 7) {
        throw "robocopy failed for $Source (exit $code)."
    }
}

Write-Host ''
Write-Host '  PROCURE360 - native Windows bundle builder' -ForegroundColor White
Write-Host ''

if (-not (Test-Path -LiteralPath $csc)) {
    throw "The .NET Framework C# compiler was not found at $csc."
}

Write-Step 'Cleaning the staging folder'
if (Test-Path -LiteralPath $stagingParent) {
    Remove-Item -LiteralPath $stagingParent -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $cache -Force | Out-Null

Write-Step 'Building the frontend'
if (-not $SkipFrontend) {
    Push-Location (Join-Path $project 'frontend')
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed (exit $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
}
$dist = Join-Path $project 'frontend\dist\index.html'
if (-not (Test-Path -LiteralPath $dist)) {
    throw "The frontend build is missing: $dist"
}
Copy-Tree -Source (Join-Path $project 'frontend\dist') -Destination (Join-Path $staging 'frontend\dist')
Write-Ok 'Frontend copied'

Write-Step 'Assembling the embedded Python runtime'
if (-not (Test-Path -LiteralPath $pythonZip)) {
    Write-Info "Downloading Python $pythonVersion embeddable runtime..."
    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip -UseBasicParsing
}
$runtime = Join-Path $staging 'runtime\python'
Expand-Archive -LiteralPath $pythonZip -DestinationPath $runtime -Force

$pth = Get-ChildItem -LiteralPath $runtime -Filter '*._pth' | Select-Object -First 1
if (-not $pth) {
    throw "The Python embeddable archive did not contain a ._pth file."
}
$stdlibZip = Get-ChildItem -LiteralPath $runtime -Filter 'python*.zip' | Select-Object -First 1
if (-not $stdlibZip) {
    throw "The Python embeddable archive did not contain the standard library zip."
}
@(
    $stdlibZip.Name,
    '.',
    'Lib\site-packages',
    '..\..\backend',
    'import site'
) | Set-Content -LiteralPath $pth.FullName -Encoding ASCII

Copy-Tree -Source (Join-Path $project '.venv\Lib\site-packages') `
    -Destination (Join-Path $runtime 'Lib\site-packages') `
    -ExcludeDirs @('__pycache__', 'pip', 'psycopg', 'psycopg_binary', 'setuptools', 'wheel') `
    -ExcludeFiles @('*.pyc')
Write-Ok 'Python runtime assembled'

Write-Step 'Copying the backend and service host'
Copy-Tree -Source (Join-Path $project 'backend') -Destination (Join-Path $staging 'backend') `
    -ExcludeDirs @('__pycache__', '.pytest_cache', '.mypy_cache') `
    -ExcludeFiles @('*.pyc', '*.db', '.env', 'install.log', 'Dockerfile', '.dockerignore', 'docker-entrypoint.sh')
Copy-Tree -Source (Join-Path $project 'frontend') -Destination (Join-Path $staging 'frontend') `
    -ExcludeDirs @('node_modules', 'dist', 'certs', '__pycache__') `
    -ExcludeFiles @('*.log', 'Dockerfile', '.env', '.env.local')
Copy-Tree -Source (Join-Path $project 'frontend\dist') -Destination (Join-Path $staging 'frontend\dist')

$serviceDir = Join-Path $staging 'service'
New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
& $csc /nologo /target:exe /platform:x64 /optimize+ `
    "/out:$serviceDir\procure360-service.exe" `
    /r:System.ServiceProcess.dll `
    (Join-Path $project 'service\Procure360Service.cs')
if ($LASTEXITCODE -ne 0) {
    throw "Could not compile the Windows service host (exit $LASTEXITCODE)."
}
Copy-Item -LiteralPath (Join-Path $project 'service\Procure360Service.cs') -Destination $serviceDir
Write-Ok 'Service host compiled'

Write-Step 'Copying the installer and documentation'
$rootFiles = @(
    'install.ps1',
    'Setup.cmd',
    'uninstall.ps1',
    'Uninstall.cmd',
    'Start PROCURE360.cmd',
    'Use-SystemPython.ps1',
    'README.md',
    '.env.example'
)
foreach ($name in $rootFiles) {
    Copy-Item -LiteralPath (Join-Path $project $name) -Destination (Join-Path $staging $name)
}
Write-Ok 'Installer files copied'

Write-Step 'Validating the bundle'
$python = Join-Path $runtime 'python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw "Bundled python.exe is missing."
}
$previousNoBytecode = $env:PYTHONDONTWRITEBYTECODE
$env:PYTHONDONTWRITEBYTECODE = '1'
try {
    & $python -c "import fastapi, sqlalchemy, uvicorn, alembic, pydantic, jwt, pwdlib, openpyxl; print('runtime ok')"
    $runtimeExit = $LASTEXITCODE
} finally {
    if ($null -eq $previousNoBytecode) {
        Remove-Item Env:PYTHONDONTWRITEBYTECODE -ErrorAction SilentlyContinue
    } else {
        $env:PYTHONDONTWRITEBYTECODE = $previousNoBytecode
    }
}
if ($runtimeExit -ne 0) {
    throw "The bundled Python runtime could not import the application dependencies."
}
if (-not (Test-Path -LiteralPath (Join-Path $staging 'frontend\dist\index.html'))) {
    throw "The frontend build was not copied."
}
if (-not (Test-Path -LiteralPath (Join-Path $serviceDir 'procure360-service.exe'))) {
    throw "The service host was not compiled."
}
if (Test-Path -LiteralPath (Join-Path $staging '.env')) {
    throw "The staging bundle contains a .env file."
}
if (Get-ChildItem -LiteralPath $staging -Recurse -Filter '*.db' -ErrorAction SilentlyContinue) {
    throw "The staging bundle contains a database file."
}

Write-Step 'Removing generated Python caches'
$cacheDirs = @(Get-ChildItem -LiteralPath $staging -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue)
foreach ($dir in $cacheDirs) {
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
}
$cacheFiles = @(Get-ChildItem -LiteralPath $staging -Recurse -File -Filter '*.pyc' -ErrorAction SilentlyContinue) +
    @(Get-ChildItem -LiteralPath $staging -Recurse -File -Filter '*.pyo' -ErrorAction SilentlyContinue)
foreach ($file in $cacheFiles) {
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
}
if (Get-ChildItem -LiteralPath $staging -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue) {
    throw "Could not remove all __pycache__ folders from the bundle."
}
Write-Ok 'Python caches removed'
Write-Ok 'Bundle validation passed'

Write-Step 'Writing the zip'
$zipDir = Split-Path -Parent $OutputZip
if (-not (Test-Path -LiteralPath $zipDir)) {
    New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
}
if (Test-Path -LiteralPath $OutputZip) {
    Remove-Item -LiteralPath $OutputZip -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $OutputZip,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    $prefixLength = $stagingParent.Length + 1
    foreach ($file in Get-ChildItem -LiteralPath $stagingParent -Recurse -File) {
        $relative = $file.FullName.Substring($prefixLength).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $relative,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

$zipInfo = Get-Item -LiteralPath $OutputZip
$hash = (Get-FileHash -LiteralPath $OutputZip -Algorithm SHA256).Hash
$archive = [System.IO.Compression.ZipFile]::OpenRead($OutputZip)
try {
    $files = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
} finally {
    $archive.Dispose()
}

$envEntries = @($files | Where-Object {
    $leaf = ($_.FullName -split '/')[-1]
    $leaf -eq '.env' -or ($leaf -like '.env.*' -and $leaf -ne '.env.example')
})
$dbEntries = @($files | Where-Object { $_.FullName -match '(?i)\.(db|sqlite|sqlite3|db-wal|db-shm)$' })
$cacheEntries = @($files | Where-Object {
    $_.FullName -match '(?i)(^|/)__pycache__/' -or $_.FullName -match '(?i)\.py[co]$'
})
$dependencyEntries = @($files | Where-Object { $_.FullName -match '(?i)(^|/)(node_modules|\.venv)/' })
if ($envEntries -or $dbEntries -or $cacheEntries -or $dependencyEntries) {
    throw 'The zip contains files that must not be shipped (.env, database, Python cache or dependency folders).'
}

Write-Host ''
Write-Host "Bundle:  $($zipInfo.FullName)" -ForegroundColor Green
Write-Host "Size:    $([Math]::Round($zipInfo.Length / 1MB, 2)) MB"
Write-Host "Files:   $($files.Count)"
Write-Host "SHA256:  $hash"
Write-Host ''
Write-Host 'Empty-register checks:' -ForegroundColor Cyan
Write-Host "  .env present:       $([bool]$envEntries)"
Write-Host "  database present:   $([bool]$dbEntries)"
Write-Host "  python caches:      $([bool]$cacheEntries)"
Write-Host "  node_modules/.venv: $([bool]$dependencyEntries)"
Write-Host "  service present:    $([bool]($files | Where-Object FullName -eq 'PROCURE360/service/procure360-service.exe'))"
Write-Host "  frontend present:   $([bool]($files | Where-Object FullName -eq 'PROCURE360/frontend/dist/index.html'))"
Write-Host ''

if (-not $KeepStaging) {
    Remove-Item -LiteralPath $stagingParent -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '' 
    Write-Host 'Staging folder removed.' -ForegroundColor DarkGray
} else {
    Write-Host "Staging kept at: $staging" -ForegroundColor DarkGray
}
