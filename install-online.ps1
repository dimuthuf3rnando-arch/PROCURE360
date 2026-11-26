#requires -Version 5.1
<#
.SYNOPSIS
    One-click PROCURE360 installer for Windows using a native service and SQLite.

.DESCRIPTION
    Prepares .env with strong random secrets, initialises the bundled SQLite
    database, creates the first administrator, registers PROCURE360 as a
    Windows service, adds the firewall rule and opens the app.

    No Docker, WSL or internet connection is required after the bundle has
    been extracted.

    Run it through Setup.cmd (double-click). Setup.cmd requests administrator
    rights because installing a Windows service needs them.

.PARAMETER AdminEmail
    Email for the first administrator. Prompted when omitted.

.PARAMETER AdminPassword
    Password for the first administrator. Prompted securely when omitted.

.PARAMETER AdminName
    Display name for the first administrator.

.PARAMETER Port
    Public HTTP port. Defaults to APP_PORT from .env, or 8080.

.PARAMETER NoBrowser
    Do not open the browser at the end.

.PARAMETER NonInteractive
    Never prompt. Requires -AdminPassword and an elevated shell.

.PARAMETER DryRun
    Print what would happen without changing anything.

.PARAMETER NoService
    Prepare the database but do not register/start the Windows service.
    Intended for testing and portable use.

.PARAMETER NoElevate
    Do not request administrator rights automatically (used by -DryRun).

.EXAMPLE
    .\Setup.cmd

.EXAMPLE
    .\Setup.cmd -Port 8090 -AdminEmail admin@company.com
#>
[CmdletBinding()]
param(
    [string]$AdminEmail,
    [string]$AdminPassword,
    [string]$AdminName = 'System Administrator',
    [int]$Port = 0,
    [switch]$NoBrowser,
    [switch]$NonInteractive,
    [switch]$DryRun,
    [switch]$NoService,
    [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'
$script:Root = $PSScriptRoot
$script:EnvPath = Join-Path $script:Root '.env'
$script:LogPath = Join-Path $script:Root 'install.log'
$script:Backend = Join-Path $script:Root 'backend'
$script:FrontendDist = Join-Path $script:Root 'frontend\dist'
$script:RuntimeDir = Join-Path $script:Root 'runtime'
$script:SitePackages = Join-Path $script:RuntimeDir 'system-site-packages'
$script:LaunchConf = Join-Path $script:RuntimeDir 'launch.conf'
$script:Python = ''   # resolved from system Python during setup
$script:DataDir = Join-Path $script:Root 'data'
$script:DbPath = Join-Path $script:DataDir 'procure360.db'
$script:ServiceDir = Join-Path $script:Root 'service'
$script:ServiceExe = Join-Path $script:ServiceDir 'procure360-service.exe'
$script:ServiceName = 'PROCURE360'
$script:IsWindows = ($env:OS -eq 'Windows_NT')
$script:TranscriptActive = $false
$script:DryRunEnvPath = $null

# Spinner state -------------------------------------------------------------
$script:SpinnerFrames = @('|', '/', '-', '\')
$script:SpinnerFrame = 0
$script:SpinnerActive = $false
$script:SpinnerLastLength = 0
$script:SpinnerEnabled = $true
try {
    $script:SpinnerEnabled = -not [Console]::IsOutputRedirected
} catch {
    $script:SpinnerEnabled = $false
}

# A dry run must not touch the real .env, data folder or service.
if ($DryRun) {
    $script:LogPath = Join-Path $env:TEMP 'procure360-install-dryrun.log'
    $script:DryRunEnvPath = Join-Path $env:TEMP "procure360-dryrun-$PID.env"
    if (Test-Path -LiteralPath $script:EnvPath) {
        Copy-Item -LiteralPath $script:EnvPath -Destination $script:DryRunEnvPath -Force
    } else {
        Copy-Item -LiteralPath (Join-Path $script:Root '.env.example') -Destination $script:DryRunEnvPath -Force
    }
    $script:EnvPath = $script:DryRunEnvPath
}

function Write-Step {
    param([string]$Message)
    Stop-Spinner
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Stop-Spinner
    Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Stop-Spinner
    Write-Host "  !!  $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Stop-Spinner
    Write-Host "  XX  $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Stop-Spinner
    Write-Host "      $Message" -ForegroundColor Gray
}

function Format-Duration {
    param([TimeSpan]$Span)
    if ($Span.TotalSeconds -lt 60) {
        return "$([int]$Span.TotalSeconds)s"
    }
    if ($Span.TotalMinutes -lt 60) {
        return "$([int]$Span.TotalMinutes)m $($Span.Seconds)s"
    }
    return "$([int]$Span.TotalHours)h $($Span.Minutes)m"
}

function Update-Spinner {
    param(
        [string]$Activity,
        [datetime]$Started,
        [string]$Detail = ''
    )
    if (-not $script:SpinnerEnabled) {
        return
    }
    $elapsed = [int]((Get-Date) - $Started).TotalSeconds
    $text = "  $($script:SpinnerFrames[$script:SpinnerFrame])  $Activity"
    if ($Detail) {
        $text += " - $Detail"
    }
    $text += " ($elapsed s)"
    try {
        $width = [Console]::WindowWidth
    } catch {
        $width = 100
    }
    if ($width -le 0) {
        $width = 100
    }
    $max = [Math]::Max(20, $width - 1)
    if ($text.Length -gt $max) {
        $text = $text.Substring(0, $max - 3) + '...'
    }
    $padding = [Math]::Max(0, $script:SpinnerLastLength - $text.Length)
    try {
        [Console]::Write("`r" + $text + (' ' * $padding))
        $script:SpinnerActive = $true
        $script:SpinnerLastLength = $text.Length
        $script:SpinnerFrame = ($script:SpinnerFrame + 1) % $script:SpinnerFrames.Count
    } catch {
        $script:SpinnerEnabled = $false
    }
}

function Stop-Spinner {
    if (-not $script:SpinnerActive) {
        return
    }
    if ($script:SpinnerEnabled) {
        try {
            $width = [Math]::Max(1, $script:SpinnerLastLength)
            [Console]::Write("`r" + (' ' * $width) + "`r")
        } catch {
        }
    }
    $script:SpinnerActive = $false
    $script:SpinnerLastLength = 0
}

function Show-LogFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    $lines = Get-Content -LiteralPath $Path -Tail 40 -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($lines) {
        foreach ($line in $lines) {
            Write-Host "      $line" -ForegroundColor DarkGray
        }
    }
}

function Invoke-SpinnerCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$Activity,
        [string]$WorkingDirectory = $script:Root
    )
    if ($DryRun) {
        Write-Info "[dry run] $Activity"
        return 0
    }
    $stamp = [guid]::NewGuid().ToString('N')
    $outFile = Join-Path $env:TEMP "procure360-$PID-$stamp.out.log"
    $errFile = Join-Path $env:TEMP "procure360-$PID-$stamp.err.log"
    $started = Get-Date
    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru `
            -RedirectStandardOutput $outFile -RedirectStandardError $errFile
        while (-not $process.HasExited) {
            Update-Spinner -Activity $Activity -Started $started
            Start-Sleep -Milliseconds 150
            $process.Refresh()
        }
        $process.WaitForExit()
        $code = $process.ExitCode
        if ($null -eq $code) {
            $code = 0
        }
        $duration = Format-Duration ((Get-Date) - $started)
        Stop-Spinner
        if ($code -eq 0) {
            Write-Ok "$Activity ($duration)"
        } else {
            Write-Warn "$Activity failed (exit $code, $duration)."
            Show-LogFile $outFile
            Show-LogFile $errFile
        }
        return $code
    } catch {
        Stop-Spinner
        Write-Warn "Could not run ${FilePath}: $($_.Exception.Message)"
        return 1
    } finally {
        Stop-Spinner
        Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function ConvertTo-QuotedArgument {
    param([string]$Value)
    if ($Value -match '[\s"]') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }
    return $Value
}

# Elevate once, before doing anything that needs the service manager. ---------
if (-not $DryRun -and -not $NoService -and -not $NoElevate -and -not (Test-IsAdmin)) {
    if ($NonInteractive) {
        Write-Host ''
        Write-Host 'Unattended setup must run from an administrator PowerShell.' -ForegroundColor Red
        Write-Host 'Right-click Setup.cmd and choose "Run as administrator".' -ForegroundColor Red
        exit 2
    }
    $forward = @()
    foreach ($entry in $PSBoundParameters.GetEnumerator()) {
        if ($entry.Value -is [System.Management.Automation.SwitchParameter]) {
            if ($entry.Value.IsPresent) {
                $forward += "-$($entry.Key)"
            }
        } elseif ($null -ne $entry.Value -and "$($entry.Value)" -ne '') {
            $forward += "-$($entry.Key)"
            $forward += (ConvertTo-QuotedArgument ([string]$entry.Value))
        }
    }
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }
    $argumentList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', (ConvertTo-QuotedArgument $scriptPath)
    ) + $forward

    Write-Host ''
    Write-Host '  PROCURE360 - one-click setup' -ForegroundColor White
    Write-Host '  Windows service + SQLite installation' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  Administrator rights are needed to install the Windows service.' -ForegroundColor Yellow
    Write-Host '  Approve the Windows prompt to continue...' -ForegroundColor Yellow
    try {
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs `
            -ArgumentList $argumentList -Wait -PassThru
        exit $process.ExitCode
    } catch {
        Write-Host ''
        Write-Host 'Administrator permission was not granted.' -ForegroundColor Red
        Write-Host 'Right-click Setup.cmd and choose "Run as administrator".' -ForegroundColor Red
        exit 2
    }
}

function Start-SetupLog {
    try {
        Start-Transcript -Path $script:LogPath -Append | Out-Null
        $script:TranscriptActive = $true
    } catch {
        Write-Warn "Could not start the log file: $($_.Exception.Message)"
    }
}

function Stop-SetupLog {
    if ($script:TranscriptActive) {
        try {
            Stop-Transcript | Out-Null
        } catch {
        }
        $script:TranscriptActive = $false
    }
}

function Get-EnvValue {
    param(
        [string]$Key,
        [string]$Default = ''
    )
    if (-not (Test-Path -LiteralPath $script:EnvPath)) {
        return $Default
    }
    $text = [System.IO.File]::ReadAllText($script:EnvPath)
    $pattern = '(?m)^[ \t]*' + [regex]::Escape($Key) + '[ \t]*=[ \t]*([^\r\n]*)'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
        return $Default
    }
    $value = $match.Groups[1].Value.Trim()
    if ($value.Length -ge 2) {
        $first = $value.Substring(0, 1)
        $last = $value.Substring($value.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }
    return $value
}

function Set-EnvValue {
    param(
        [string]$Key,
        [string]$Value
    )
    $text = ''
    if (Test-Path -LiteralPath $script:EnvPath) {
        $text = [System.IO.File]::ReadAllText($script:EnvPath)
    }
    $pattern = '(?m)^[ \t]*' + [regex]::Escape($Key) + '[ \t]*=[^\r\n]*'
    $line = $Key + '=' + $Value
    $escaped = $line.Replace('$', '$$')
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, $escaped)
    } else {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) {
            $text += "`r`n"
        }
        $text += $line + "`r`n"
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($script:EnvPath, $text, $encoding)
}

function New-HexSecret {
    param([int]$ByteCount)
    $bytes = [byte[]]::new($ByteCount)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    return (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
}

function Initialize-EnvFile {
    $created = $false
    if (-not (Test-Path -LiteralPath $script:EnvPath)) {
        $example = Join-Path $script:Root '.env.example'
        if (-not (Test-Path -LiteralPath $example)) {
            throw "The bundle is incomplete: .env.example is missing."
        }
        Copy-Item -LiteralPath $example -Destination $script:EnvPath
        $created = $true
        Write-Ok "Created .env from .env.example"
    }

    $existingDb = Get-EnvValue -Key 'DATABASE_URL'
    if ($existingDb -and $existingDb -notlike 'sqlite:*') {
        throw "This folder is configured for PostgreSQL ($existingDb). Use a fresh native PROCURE360 folder."
    }

    $secret = Get-EnvValue -Key 'SECRET_KEY'
    if ([string]::IsNullOrWhiteSpace($secret) -or $secret -like 'change-this*') {
        Set-EnvValue -Key 'SECRET_KEY' -Value (New-HexSecret 32)
        Write-Ok "Generated a new SECRET_KEY"
    }

    $dbUrl = 'sqlite:///' + ($script:DbPath -replace '\\', '/')
    Set-EnvValue -Key 'DATABASE_URL' -Value ('"' + $dbUrl + '"')
    Set-EnvValue -Key 'ENVIRONMENT' -Value 'production'
    Set-EnvValue -Key 'AUTO_CREATE_TABLES' -Value 'false'
    Set-EnvValue -Key 'SEED_DEMO_DATA' -Value 'false'
    Set-EnvValue -Key 'BACKUP_ENABLED' -Value 'true'
    if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'BACKUP_INTERVAL_SECONDS'))) {
        Set-EnvValue -Key 'BACKUP_INTERVAL_SECONDS' -Value '86400'
    }
    if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'BACKUP_RETENTION_DAYS'))) {
        Set-EnvValue -Key 'BACKUP_RETENTION_DAYS' -Value '14'
    }
    if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'TZ'))) {
        Set-EnvValue -Key 'TZ' -Value 'Asia/Colombo'
    }

    if ($created) {
        Write-Ok "Native SQLite configuration written"
    }
}

function Resolve-Port {
    param([int]$Requested)
    if ($Requested -gt 0) {
        if ($Requested -lt 1024 -or $Requested -gt 65535) {
            throw "Port must be between 1024 and 65535."
        }
        return $Requested
    }
    $value = Get-EnvValue -Key 'APP_PORT'
    if ($value -match '^\d+$') {
        $parsed = [int]$value
        if ($parsed -ge 1024 -and $parsed -le 65535) {
            return $parsed
        }
    }
    return 8080
}

function Test-PortAvailable {
    param([int]$Port)
    if ($DryRun) {
        return $true
    }
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            try {
                $listener.Stop()
            } catch {
            }
        }
    }
}

function Test-AppHealth {
    param([int]$Port)
    if ($DryRun) {
        return $true
    }
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" `
            -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Test-OwnServiceHealthy {
    param([int]$Port)
    if ($DryRun) {
        return $false
    }
    $service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
    if (-not $service -or $service.Status -ne 'Running') {
        return $false
    }
    return (Test-AppHealth -Port $Port)
}

function Resolve-UsablePort {
    param([int]$StartPort)
    $port = $StartPort
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        if (Test-PortAvailable $port) {
            return $port
        }
        if (Test-OwnServiceHealthy -Port $port) {
            Write-Warn "Reusing the running PROCURE360 service on port $port."
            return $port
        }
        if ($NonInteractive) {
            throw "Port $port is already in use. Re-run with -Port <free-port>."
        }
        Write-Warn "Port $port is already in use."
        $answer = Read-Host "Enter another port, or press Enter for $($port + 1)"
        if ([string]::IsNullOrWhiteSpace($answer)) {
            $port++
        } elseif ($answer -match '^\d+$') {
            $port = [int]$answer
        } else {
            Write-Warn "Enter a number."
        }
    }
    throw "Could not find a free port. Re-run Setup.cmd with -Port <free-port>."
}

function Assert-Bundle {
    $required = @(
        (Join-Path $script:Backend 'run_server.py'),
        (Join-Path $script:Backend 'alembic.ini'),
        (Join-Path $script:Backend 'requirements.txt'),
        (Join-Path $script:FrontendDist 'index.html'),
        $script:ServiceExe,
        (Join-Path $script:Root '.env.example')
    )
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "The bundle is incomplete: $path is missing. Extract the whole zip and run Setup.cmd from the PROCURE360 folder."
        }
    }
}

function Get-AdminEmail {
    param([string]$Provided)
    $email = $Provided
    if ([string]::IsNullOrWhiteSpace($email)) {
        if ($NonInteractive) {
            $email = 'admin@procure360.lk'
        } else {
            $email = Read-Host "Administrator email [admin@procure360.lk]"
            if ([string]::IsNullOrWhiteSpace($email)) {
                $email = 'admin@procure360.lk'
            }
        }
    }
    $email = $email.Trim().ToLowerInvariant()
    if ($email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        throw "Enter a valid administrator email address."
    }
    if ($email -match '\.(local|test|invalid|localhost)$') {
        throw "Use a normal email domain; .local and .test addresses are rejected at sign-in."
    }
    return $email
}

function Read-PlainPassword {
    param([string]$Prompt)
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Get-AdminPassword {
    param([string]$Provided)
    if (-not [string]::IsNullOrEmpty($Provided)) {
        if ($Provided.Length -lt 8) {
            throw "The administrator password must be at least 8 characters."
        }
        return $Provided
    }
    if ($NonInteractive) {
        throw "Non-interactive setup needs -AdminPassword with at least 8 characters."
    }
    while ($true) {
        $first = Read-PlainPassword "Administrator password (min 8 characters)"
        if ($first.Length -lt 8) {
            Write-Warn "Use at least 8 characters."
            continue
        }
        $second = Read-PlainPassword "Confirm administrator password"
        if ($first -ne $second) {
            Write-Warn "Passwords do not match."
            continue
        }
        return $first
    }
}

function Find-SystemPython {
    # Prefer resolving the real python.exe via `py -3 -c` so we never hand the
    # py.exe launcher to the service (it cannot run a script reliably).
    $py = Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($py) {
        foreach ($c in @('-3', '-3.14', '-3.13', '-3.12', '-3.11')) {
            try {
                $path = & $py.Source $c -c "import sys; print(sys.executable)" 2>$null
                if ($LASTEXITCODE -eq 0 -and $path -and (Test-Path -LiteralPath ($path.Trim()))) {
                    return $path.Trim()
                }
            } catch { }
        }
    }
    foreach ($cmd in @('python.exe', 'python3.exe')) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found -and $found.Source) {
            try {
                $path = & $found.Source -c "import sys; print(sys.executable)" 2>$null
                if ($LASTEXITCODE -eq 0 -and $path -and (Test-Path -LiteralPath ($path.Trim()))) {
                    return $path.Trim()
                }
            } catch { }
        }
    }
    return $null
}

function Install-Dependencies {
    Write-Step 'Installing Python dependencies'
    $python = Find-SystemPython
    if (-not $python) {
        throw "No system Python was found. Install Python 3.11 or newer from https://www.python.org/downloads/ and tick 'Add Python to PATH', then re-run Setup.cmd."
    }
    $script:Python = $python
    $version = & $python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2>&1
    Write-Info "Using system Python $version at $python"
    if ($DryRun) {
        Write-Info "[dry run] would install dependencies into $script:SitePackages"
        return
    }
    New-Item -ItemType Directory -Path $script:SitePackages -Force | Out-Null
    $code = Invoke-SpinnerCommand -FilePath $python `
        -Arguments @('-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade',
                     '--target', $script:SitePackages, '-r', (Join-Path $script:Backend 'requirements.txt')) `
        -WorkingDirectory $script:Backend `
        -Activity 'Downloading and installing dependencies'
    if ($code -ne 0) {
        throw "Dependency installation failed (exit $code). Check your internet connection and try again."
    }
    Write-Ok "Dependencies installed in $script:SitePackages"
}

function Write-LaunchConfig {
    if ($DryRun) {
        Write-Info '[dry run] would write runtime\launch.conf for the system Python'
        return
    }
    New-Item -ItemType Directory -Path $script:RuntimeDir -Force | Out-Null
    $content = @(
        '# Generated by install.ps1 - system Python mode',
        "python=$($script:Python)",
        "site-packages=$($script:SitePackages)"
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($script:LaunchConf, $content + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "Runtime configuration written to $script:LaunchConf"
}

function Set-AppEnvironment {
    param([int]$AppPort)
    $env:PYTHONPATH = $script:Backend + [IO.Path]::PathSeparator + $script:SitePackages
    $env:DATABASE_URL = 'sqlite:///' + ($script:DbPath -replace '\\', '/')
    $env:ENVIRONMENT = 'production'
    $env:SEED_DEMO_DATA = 'false'
    $env:AUTO_CREATE_TABLES = 'false'
    $env:BACKUP_ENABLED = 'true'
    $env:APP_PORT = [string]$AppPort
}

function Initialize-Database {
    Write-Step 'Preparing the SQLite database'
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $script:DataDir 'logs') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $script:DataDir 'backups') -Force | Out-Null
    }
    Set-AppEnvironment -AppPort $script:AppPort

    $code = Invoke-SpinnerCommand -FilePath $script:Python `
        -Arguments @('-m', 'alembic', 'upgrade', 'head') `
        -WorkingDirectory $script:Backend `
        -Activity 'Applying database migrations'
    if ($code -ne 0) {
        throw "Database migrations failed (exit $code). See the lines above."
    }

    $code = Invoke-SpinnerCommand -FilePath $script:Python `
        -Arguments @('-m', 'app.seed.seed_masters', '--no-demo') `
        -WorkingDirectory $script:Backend `
        -Activity 'Seeding dropdown lists and evaluation team'
    if ($code -ne 0) {
        throw "Master-data seeding failed (exit $code). See the lines above."
    }
    if ($DryRun) {
        Write-Info "[dry run] database would be created at $script:DbPath"
    } else {
        Write-Ok "SQLite database ready: $script:DbPath"
    }
}

function New-AdminAccount {
    param(
        [string]$Email,
        [string]$Password,
        [string]$Name
    )
    Write-Step "Creating the first administrator"
    if ($DryRun) {
        Write-Info "[dry run] would create administrator $Email"
        return
    }
    Set-AppEnvironment -AppPort $script:AppPort
    Write-Info "Creating $Email ..."
    $output = $Password | & $script:Python -m app.seed.bootstrap_admin `
        --email $Email --password-stdin --name $Name 2>&1
    $code = $LASTEXITCODE
    $existing = $false
    if ($output) {
        foreach ($line in $output) {
            $text = [string]$line
            Write-Info $text
            if ($text -match 'already exists') {
                $existing = $true
            }
        }
    }
    if ($code -ne 0) {
        throw "Could not create the administrator (exit $code)."
    }
    if ($existing) {
        Write-Warn "That email already exists; its password was not changed. Sign in with the existing password or use another email."
    } else {
        Write-Ok "Administrator account ready: $Email"
    }
}

function Get-ServiceStatus {
    $service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        return $service.Status
    }
    return $null
}

function Stop-AppService {
    if ($DryRun) {
        return
    }
    $service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
    if (-not $service -or $service.Status -eq 'Stopped') {
        return
    }
    Write-Info "Stopping the existing PROCURE360 service..."
    $started = Get-Date
    $null = Invoke-SpinnerCommand -FilePath 'sc.exe' -Arguments @('stop', $script:ServiceName) `
        -Activity 'Stopping the previous service'
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if ((Get-ServiceStatus) -eq 'Stopped') {
            Stop-Spinner
            Write-Ok "Previous service stopped"
            return
        }
        Update-Spinner -Activity 'Waiting for the service to stop' -Started $started
        Start-Sleep -Milliseconds 250
    }
    Stop-Spinner
    Write-Warn "The service did not stop within 30 seconds; continuing."
}

function Remove-AppService {
    if ($DryRun) {
        return
    }
    if (-not (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue)) {
        return
    }
    $code = Invoke-SpinnerCommand -FilePath 'sc.exe' -Arguments @('delete', $script:ServiceName) `
        -Activity 'Removing the previous service registration'
    if ($code -ne 0) {
        Write-Warn "Could not remove the previous service registration (exit $code)."
        return
    }
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline -and (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 200
    }
}

function Show-ServiceLogs {
    $logDir = Join-Path $script:DataDir 'logs'
    if (-not (Test-Path -LiteralPath $logDir)) {
        return
    }
    $logs = Get-ChildItem -LiteralPath $logDir -Filter '*.log' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 2
    foreach ($log in $logs) {
        Write-Info "Log: $($log.FullName)"
        Show-LogFile $log.FullName
    }
}

function Wait-AppHealth {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 120,
        [string]$Activity = 'Waiting for PROCURE360 to start'
    )
    if ($DryRun) {
        Write-Info "[dry run] would wait for http://127.0.0.1:$Port/api/health"
        return $true
    }
    $started = Get-Date
    $deadline = $started.AddSeconds($TimeoutSeconds)
    $nextCheck = $started
    $nextNotice = $started
    while ((Get-Date) -lt $deadline) {
        if ((Get-Date) -ge $nextCheck) {
            if (Test-AppHealth -Port $Port) {
                Stop-Spinner
                return $true
            }
            $nextCheck = (Get-Date).AddSeconds(3)
        }
        if ($script:SpinnerEnabled) {
            Update-Spinner -Activity $Activity -Started $started
        } elseif ((Get-Date) -ge $nextNotice) {
            Write-Info "$Activity..."
            $nextNotice = (Get-Date).AddSeconds(15)
        }
        Start-Sleep -Milliseconds 200
    }
    Stop-Spinner
    return $false
}

function Install-AppService {
    Write-Step 'Installing the Windows service'
    if ($DryRun) {
        Write-Info "[dry run] would register and start the PROCURE360 Windows service"
        return
    }
    Remove-AppService

    try {
        New-Service -Name $script:ServiceName -BinaryPathName "`"$script:ServiceExe`"" `
            -DisplayName 'PROCURE360' `
            -Description 'PROCURE360 procurement register (LAN web application)' `
            -StartupType Automatic -ErrorAction Stop | Out-Null
        Write-Ok "Service registered: $script:ServiceName"
    } catch {
        throw "Could not register the Windows service: $($_.Exception.Message)"
    }

    $null = Invoke-SpinnerCommand -FilePath 'sc.exe' `
        -Arguments @('failure', $script:ServiceName, 'reset=', '86400', 'actions=', 'restart/10000/restart/10000/restart/10000') `
        -Activity 'Configuring restart-on-failure'

    Write-Info "Starting the PROCURE360 service..."
    try {
        Start-Service -Name $script:ServiceName -ErrorAction Stop
    } catch {
        Show-ServiceLogs
        throw "Could not start the Windows service: $($_.Exception.Message)"
    }

    if (-not (Wait-AppHealth -Port $script:AppPort -TimeoutSeconds 120 -Activity 'Waiting for PROCURE360 to become ready')) {
        Show-ServiceLogs
        throw "The service started but the app did not respond on port $script:AppPort. Check the service logs above."
    }
    Write-Ok "PROCURE360 is running as a Windows service"
}

function Ensure-FirewallRule {
    param([int]$AppPort)
    if (-not $script:IsWindows) {
        return
    }
    $ruleName = "PROCURE360 (TCP $AppPort)"
    if ($DryRun) {
        Write-Info "[dry run] would add a Windows Firewall rule for TCP $AppPort (all profiles)"
        return
    }
    # Remove any old PROCURE360 rules (including Private/Domain-only ones from
    # previous installs) so the new rule applies on all network profiles.
    try {
        Get-NetFirewallRule -DisplayName 'PROCURE360 (TCP *)' -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule -ErrorAction SilentlyContinue
    } catch {
    }
    try {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP ` 
            -LocalPort $AppPort -Action Allow -Profile Any -ErrorAction Stop | Out-Null
        Write-Ok "Firewall rule added for TCP $AppPort (all profiles)"
    } catch {
        Write-Warn "Could not add the firewall rule: $($_.Exception.Message)"
    }
}

function Get-LanAddress {
    try {
        $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
            Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
            Select-Object -First 1
        if ($config -and $config.IPv4Address) {
            return ($config.IPv4Address | Select-Object -First 1).IPAddress
        }
    } catch {
    }
    try {
        $address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1
        if ($address) {
            return $address.IPAddress
        }
    } catch {
    }
    return $null
}

function Show-Summary {
    param(
        [int]$AppPort,
        [string]$Email
    )
    $lan = Get-LanAddress
    Write-Host ''
    Write-Host 'PROCURE360 is ready.' -ForegroundColor Green
    Write-Host "  Local:   http://localhost:$AppPort"
    if ($lan) {
        Write-Host "  LAN:     http://${lan}:$AppPort"
    }
    Write-Host "  Admin:   $Email"
    Write-Host "  Data:    $script:DataDir"
    if (-not $NoService) {
        Write-Host "  Service: $script:ServiceName"
    }
    Write-Host "  Log:     $script:LogPath"
    Write-Host ''
    Write-Host 'Useful commands:' -ForegroundColor Cyan
    if (-not $NoService) {
        Write-Host "  Get-Service $script:ServiceName"
        Write-Host "  Restart-Service $script:ServiceName"
        Write-Host '  .\Uninstall.cmd'
    } else {
        Write-Host "  .\Start PROCURE360.cmd"
    }
    Write-Host ''
    Write-Host 'Backups are written daily to data\backups and kept for 14 days.' -ForegroundColor DarkGray
    Write-Host 'Keep this PC switched on. The service starts automatically at boot.' -ForegroundColor DarkGray
    Write-Host ''
}

function Invoke-Main {
    Write-Host ''
    Write-Host '  PROCURE360 - one-click setup' -ForegroundColor White
    Write-Host '  Windows service + SQLite installation' -ForegroundColor DarkGray

    if (-not $script:IsWindows) {
        throw 'This installer is for Windows.'
    }
    if ($script:Root -like '\\*') {
        throw 'Extract the bundle to a local disk folder, not a network share, before running Setup.cmd.'
    }
    if ($script:Root -match '\\OneDrive\\') {
        Write-Warn "OneDrive folders can block a Windows service. Prefer C:\PROCURE360."
    }
    Assert-Bundle

    Push-Location $script:Root
    try {
        Write-Step 'Preparing configuration'
        Initialize-EnvFile

        $appPort = Resolve-Port -Requested $Port
        $script:AppPort = $appPort
        Set-EnvValue -Key 'APP_PORT' -Value $appPort
        Set-EnvValue -Key 'CORS_ORIGINS' -Value "http://localhost:$appPort,http://127.0.0.1:$appPort"

        Write-Step 'Administrator account'
        $email = Get-AdminEmail -Provided $AdminEmail
        $password = Get-AdminPassword -Provided $AdminPassword
        $name = $AdminName
        if ([string]::IsNullOrWhiteSpace($name)) {
            $name = 'System Administrator'
        }

        $appPort = Resolve-UsablePort -StartPort $appPort
        $script:AppPort = $appPort
        Set-EnvValue -Key 'APP_PORT' -Value $appPort
        Set-EnvValue -Key 'CORS_ORIGINS' -Value "http://localhost:$appPort,http://127.0.0.1:$appPort"

        if (-not $NoService) {
            Stop-AppService
        }

        Install-Dependencies
        Write-LaunchConfig
        Initialize-Database
        New-AdminAccount -Email $email -Password $password -Name $name

        if ($NoService) {
            Write-Step 'Skipping the Windows service'
            Write-Info "Start the app manually with .\Start PROCURE360.cmd"
        } else {
            Install-AppService
            Ensure-FirewallRule -AppPort $appPort
        }

        Show-Summary -AppPort $appPort -Email $email
    } finally {
        Pop-Location
    }

    if ($DryRun) {
        Write-Warn 'Dry run complete. No changes were made.'
        return
    }

    if (-not $NoBrowser) {
        try {
            Start-Process "http://localhost:$appPort" | Out-Null
        } catch {
            Write-Warn "Could not open the browser automatically. Open http://localhost:$appPort manually."
        }
    }
    if (-not $NonInteractive) {
        Read-Host 'Press Enter to close' | Out-Null
    }
}

Start-SetupLog
$exitCode = 0
try {
    Invoke-Main
} catch {
    Write-Host ''
    Write-Err $_.Exception.Message
    Write-Info "Full log: $script:LogPath"
    $exitCode = 1
} finally {
    Stop-Spinner
    Stop-SetupLog
    if ($script:DryRunEnvPath -and (Test-Path -LiteralPath $script:DryRunEnvPath)) {
        Remove-Item -LiteralPath $script:DryRunEnvPath -Force -ErrorAction SilentlyContinue
    }
    if ($DryRun -and (Test-Path -LiteralPath $script:LogPath)) {
        Remove-Item -LiteralPath $script:LogPath -Force -ErrorAction SilentlyContinue
    }
}
exit $exitCode