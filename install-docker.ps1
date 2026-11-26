#requires -Version 5.1
<#
.SYNOPSIS
    One-click PROCURE360 installer for Windows using Docker Desktop.

.DESCRIPTION
    Prepares .env with strong random secrets, installs Docker Desktop with
    winget when it is missing, builds and starts the containers, creates the
    first administrator, adds the Windows Firewall rule and opens the app.

    Run it through Setup.cmd (double-click) so the PowerShell execution policy
    does not need to be changed.

.PARAMETER AdminEmail
    Email for the first administrator. Prompted when omitted.

.PARAMETER AdminPassword
    Password for the first administrator. Prompted securely when omitted.

.PARAMETER AdminName
    Display name for the first administrator.

.PARAMETER Port
    Public HTTP port. Defaults to APP_PORT from .env, or 8080.

.PARAMETER SkipPrereqInstall
    Never install Docker Desktop automatically; fail with instructions instead.

.PARAMETER NoBrowser
    Do not open the browser at the end.

.PARAMETER NonInteractive
    Never prompt. Requires -AdminPassword. Useful for unattended installs.

.PARAMETER DryRun
    Print what would happen without changing anything.

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
    [switch]$SkipPrereqInstall,
    [switch]$NoBrowser,
    [switch]$NonInteractive,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:Root = $PSScriptRoot
$script:EnvPath = Join-Path $script:Root '.env'
$script:LogPath = Join-Path $script:Root 'install.log'
$script:IsWindows = ($env:OS -eq 'Windows_NT')
$script:TranscriptActive = $false
$script:DryRunEnvPath = $null
$script:ProgramFiles = $env:ProgramFiles
if ($env:ProgramW6432) {
    $script:ProgramFiles = $env:ProgramW6432
}

# A dry run must not touch the real .env or create install.log in the bundle.
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
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  !!  $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  XX  $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "      $Message" -ForegroundColor Gray
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

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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
    $replacement = $Key + '=' + $Value
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, $replacement)
    } else {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) {
            $text += "`r`n"
        }
        $text += $replacement + "`r`n"
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

    $secret = Get-EnvValue -Key 'SECRET_KEY'
    if ([string]::IsNullOrWhiteSpace($secret) -or $secret -like 'change-this*') {
        Set-EnvValue -Key 'SECRET_KEY' -Value (New-HexSecret 32)
        Write-Ok "Generated a new SECRET_KEY"
    }

    $dbPassword = Get-EnvValue -Key 'POSTGRES_PASSWORD'
    if ([string]::IsNullOrWhiteSpace($dbPassword) -or $dbPassword -like 'change-this*') {
        Set-EnvValue -Key 'POSTGRES_PASSWORD' -Value (New-HexSecret 16)
        Write-Ok "Generated a new POSTGRES_PASSWORD"
    } elseif ($dbPassword -match '[@:/#?]') {
        Write-Warn "POSTGRES_PASSWORD contains characters that can break the database URL. Use letters and digits only."
    }

    if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'SEED_DEMO_DATA'))) {
        Set-EnvValue -Key 'SEED_DEMO_DATA' -Value 'false'
    }
    if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'TZ'))) {
        Set-EnvValue -Key 'TZ' -Value 'Asia/Colombo'
    }

    $demo = Get-EnvValue -Key 'SEED_DEMO_DATA'
    if ($demo -eq 'true') {
        Write-Warn "SEED_DEMO_DATA=true: demo users and sample contracts will be created."
        $demoPassword = Get-EnvValue -Key 'DEMO_PASSWORD'
        if ([string]::IsNullOrWhiteSpace($demoPassword) -or $demoPassword -like 'change-this*') {
            Write-Warn "Set a strong DEMO_PASSWORD in .env before the first boot."
        }
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
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 4
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Test-OwnFrontend {
    if ($DryRun) {
        return $false
    }
    try {
        $id = & docker compose ps -q frontend 2>$null
        return [bool]($id | Where-Object { $_ })
    } catch {
        return $false
    }
}

function Wait-AppHealth {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 180
    )
    if ($DryRun) {
        Write-Info "[dry run] would wait for http://127.0.0.1:$Port/api/health"
        return $true
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $nextNotice = Get-Date
    while ((Get-Date) -lt $deadline) {
        if (Test-AppHealth $Port) {
            return $true
        }
        if ((Get-Date) -ge $nextNotice) {
            Write-Info "Waiting for the web app on port $Port..."
            $nextNotice = (Get-Date).AddSeconds(15)
        }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Resolve-UsablePort {
    param([int]$StartPort)
    $port = $StartPort
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        if (Test-PortAvailable $port) {
            return $port
        }
        if (Test-OwnFrontend) {
            if (Wait-AppHealth -Port $port -TimeoutSeconds 60) {
                Write-Warn "Reusing the running PROCURE360 instance on port $port."
                return $port
            }
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

function Test-DockerEngine {
    $docker = Get-DockerCommand
    if (-not $docker) {
        return $false
    }
    try {
        & $docker info *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Get-DockerCommand {
    $command = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $command) {
        $command = Get-Command docker -ErrorAction SilentlyContinue
    }
    if ($command) {
        return $command.Source
    }
    return $null
}

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $additions = @()
    if ($machine) {
        $additions += $machine
    }
    if ($user -and ($env:Path -notlike "*$user*")) {
        $additions += $user
    }
    if ($additions.Count -gt 0) {
        $env:Path = ($additions -join ';') + ';' + $env:Path
    }
    $dockerBin = Join-Path $script:ProgramFiles 'Docker\Docker\resources\bin'
    if ((Test-Path -LiteralPath $dockerBin) -and ($env:Path -notlike "*$dockerBin*")) {
        $env:Path = "$dockerBin;$env:Path"
    }
}

function Start-DockerDesktop {
    $candidates = @(
        (Join-Path $script:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            Write-Info "Starting Docker Desktop..."
            if (-not $DryRun) {
                Start-Process -FilePath $path | Out-Null
            }
            return $true
        }
    }
    return $false
}

function Wait-DockerEngine {
    param([int]$TimeoutSeconds = 300)
    if ($DryRun) {
        Write-Info "[dry run] would wait for the Docker engine"
        return $true
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $nextNotice = Get-Date
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerEngine) {
            return $true
        }
        if ((Get-Date) -ge $nextNotice) {
            Write-Info "Waiting for Docker Desktop to finish starting..."
            $nextNotice = (Get-Date).AddSeconds(15)
        }
        Start-Sleep -Seconds 5
    }
    return $false
}

function Test-Wsl {
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) {
        return $false
    }
    try {
        & $wsl.Source --status *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Invoke-Native {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$Description = ''
    )
    if ($Description) {
        Write-Info $Description
    } else {
        Write-Info ("  " + $FilePath + " " + ($Arguments -join ' '))
    }
    if ($DryRun) {
        return 0
    }
    & $FilePath @Arguments
    return $LASTEXITCODE
}

function Install-DockerDesktop {
    if ($SkipPrereqInstall) {
        throw "Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/ and re-run Setup.cmd."
    }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
    }
    if (-not $winget) {
        throw "Docker Desktop is missing and winget is not available. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and re-run Setup.cmd."
    }

    Write-Step "Installing Docker Desktop"
    Write-Info "This can take several minutes and may show a Windows administrator prompt."
    $code = Invoke-Native -FilePath $winget.Source -Arguments @(
        'install', '--exact', '--id', 'Docker.DockerDesktop',
        '--accept-package-agreements', '--accept-source-agreements', '--silent'
    ) -Description "winget install Docker.DockerDesktop"

    if ($DryRun) {
        return
    }

    Update-SessionPath
    $desktop = Join-Path $script:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if ($code -ne 0 -and -not (Test-Path -LiteralPath $desktop)) {
        throw "winget could not install Docker Desktop (exit $code). Install it manually from https://www.docker.com/products/docker-desktop/ and re-run Setup.cmd."
    }
    if ($code -ne 0) {
        Write-Warn "winget returned $code, but Docker Desktop is present; continuing."
    }
}

function Ensure-Docker {
    Write-Step "Checking Docker Desktop"
    Update-SessionPath

    if (-not (Get-DockerCommand)) {
        if ($DryRun) {
            Write-Warn "Docker is not installed; a real run would install it with winget."
            return
        }
        Install-DockerDesktop
        Update-SessionPath
    }

    if (-not (Test-DockerEngine)) {
        if ($DryRun) {
            Write-Warn "The Docker engine is not running; a real run would start Docker Desktop and wait."
            return
        }
        if (-not (Start-DockerDesktop)) {
            throw "Docker Desktop is installed but could not be started. Open it manually, finish its first-run setup, then re-run Setup.cmd."
        }
        if (-not (Wait-DockerEngine)) {
            $hint = ''
            if (-not (Test-Wsl)) {
                $hint = " WSL 2 may be missing: run 'wsl --install' in an administrator PowerShell and reboot."
            }
            throw "Docker Desktop did not become ready.$hint Open Docker Desktop, accept its terms and finish setup, then re-run Setup.cmd. If it reports that virtualization is disabled, enable VT-x/AMD-V in the BIOS; if WSL 2 needs an update, run 'wsl --update'."
        }
    }
    Write-Ok "Docker engine is ready"
}

function Invoke-Compose {
    param(
        [string[]]$Arguments,
        [string]$Description
    )
    $all = @('compose') + $Arguments
    $code = Invoke-Native -FilePath 'docker' -Arguments $all -Description $Description
    if (-not $DryRun -and $code -ne 0) {
        throw "docker compose $($Arguments -join ' ') failed with exit code $code."
    }
}

function Wait-Backend {
    param([int]$TimeoutSeconds = 300)
    if ($DryRun) {
        Write-Info "[dry run] would wait for the backend health check"
        return $true
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $nextNotice = Get-Date
    while ((Get-Date) -lt $deadline) {
        $id = & docker compose ps -q backend 2>$null | Select-Object -First 1
        if ($id) {
            $id = $id.Trim()
            $status = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $id 2>$null
            if ($status) {
                $status = $status.Trim()
            }
            if ($status -eq 'healthy') {
                return $true
            }
            if ($status -eq 'unhealthy') {
                return $false
            }
        }
        if ((Get-Date) -ge $nextNotice) {
            Write-Info "Waiting for the API to become healthy..."
            $nextNotice = (Get-Date).AddSeconds(15)
        }
        Start-Sleep -Seconds 4
    }
    return $false
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
    $output = $Password | & docker compose exec -T backend python -m app.seed.bootstrap_admin --email $Email --password-stdin --name $Name 2>&1
    $code = $LASTEXITCODE
    $existing = $false
    if ($output) {
        $output | ForEach-Object {
            $line = [string]$_
            Write-Info $line
            if ($line -match 'already exists') {
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

function Install-App {
    param(
        [int]$AppPort,
        [string]$Email,
        [string]$Password,
        [string]$Name
    )
    Write-Step "Building and starting the database and API"
    Write-Info "The first build can take several minutes."
    Invoke-Compose -Arguments @('up', '-d', '--build', 'db', 'backend') -Description "docker compose up -d --build db backend"
    if (-not (Wait-Backend -TimeoutSeconds 300)) {
        Write-Warn "Recent backend logs:"
        if (-not $DryRun) {
            & docker compose logs --tail 60 backend
        }
        throw "The API did not become healthy. Check the logs above."
    }
    Write-Ok "API is healthy"

    New-AdminAccount -Email $Email -Password $Password -Name $Name

    Write-Step "Building and starting the web app"
    Invoke-Compose -Arguments @('up', '-d', '--build') -Description "docker compose up -d --build"
    if (-not (Wait-AppHealth -Port $AppPort -TimeoutSeconds 240)) {
        Write-Warn "Recent frontend logs:"
        if (-not $DryRun) {
            & docker compose logs --tail 40 frontend
        }
        throw "The web app did not respond on port $AppPort."
    }
    Write-Ok "Web app is responding on port $AppPort"
}

function Ensure-FirewallRule {
    param([int]$AppPort)
    if (-not $script:IsWindows) {
        return
    }
    $ruleName = "PROCURE360 (TCP $AppPort)"
    try {
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    } catch {
        $existing = $null
    }
    if ($existing) {
        Write-Ok "Firewall rule already exists for TCP $AppPort"
        return
    }
    if ($DryRun) {
        Write-Info "[dry run] would add a Windows Firewall rule for TCP $AppPort"
        return
    }

    if (Test-IsAdmin) {
        try {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow -Profile Private,Domain -ErrorAction Stop | Out-Null
            Write-Ok "Firewall rule added for TCP $AppPort"
            Write-Info "If other PCs still cannot connect, set this network to Private."
        } catch {
            Write-Warn "Could not add the firewall rule: $($_.Exception.Message)"
        }
        return
    }

    if ($NonInteractive) {
        Write-Warn "Firewall rule not added. Run Setup.cmd as administrator to allow LAN access."
        return
    }

    $answer = Read-Host "Allow TCP $AppPort through Windows Firewall? This needs administrator rights [Y/n]"
    if ($answer -match '^(n|no)$') {
        Write-Warn "Skipped the firewall rule; other PCs may not be able to connect."
        return
    }

    $temp = Join-Path $env:TEMP "procure360-firewall-$AppPort.ps1"
    $command = "New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow -Profile Private,Domain -ErrorAction Stop"
    Set-Content -LiteralPath $temp -Value $command -Encoding ASCII
    try {
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$temp`""
        ) -Wait -PassThru
        if ($process.ExitCode -eq 0) {
            Write-Ok "Firewall rule added for TCP $AppPort"
            Write-Info "If other PCs still cannot connect, set this network to Private."
        } else {
            Write-Warn "The firewall helper exited with code $($process.ExitCode)."
        }
    } catch {
        Write-Warn "The firewall rule was not added: $($_.Exception.Message)"
    } finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
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
    Write-Host "  Local:  http://localhost:$AppPort"
    if ($lan) {
        Write-Host "  LAN:    http://${lan}:$AppPort"
    }
    Write-Host "  Admin:  $Email"
    Write-Host "  Log:    $script:LogPath"
    Write-Host ''
    Write-Host 'Useful commands:' -ForegroundColor Cyan
    Write-Host '  docker compose ps'
    Write-Host '  docker compose logs -f backend'
    Write-Host '  docker compose down'
    Write-Host ''
    Write-Host 'Keep Docker Desktop running. Enable "Start Docker Desktop when you sign in"' -ForegroundColor DarkGray
    Write-Host 'so the containers come back automatically after a reboot.' -ForegroundColor DarkGray
    Write-Host ''
}

function Invoke-Main {
    Write-Host ''
    Write-Host '  PROCURE360 - one-click setup' -ForegroundColor White
    Write-Host '  Docker-based LAN installation' -ForegroundColor DarkGray

    if (-not $script:IsWindows) {
        throw 'This installer is for Windows. On Linux/macOS use docker compose manually.'
    }
    if ($script:Root -like '\\*') {
        throw 'Extract the bundle to a local disk folder, not a network share, before running Setup.cmd.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'docker-compose.yml'))) {
        throw 'docker-compose.yml is missing. Run Setup.cmd from the extracted PROCURE360 folder.'
    }

    Push-Location $script:Root
    try {
        Write-Step 'Preparing configuration'
        Initialize-EnvFile

        $appPort = Resolve-Port -Requested $Port
        if ($Port -gt 0) {
            Set-EnvValue -Key 'APP_PORT' -Value $appPort
        }

        Write-Step 'Administrator account'
        $email = Get-AdminEmail -Provided $AdminEmail
        $password = Get-AdminPassword -Provided $AdminPassword
        $name = $AdminName
        if ([string]::IsNullOrWhiteSpace($name)) {
            $name = 'System Administrator'
        }

        Ensure-Docker

        $appPort = Resolve-UsablePort -StartPort $appPort
        Set-EnvValue -Key 'APP_PORT' -Value $appPort

        Install-App -AppPort $appPort -Email $email -Password $password -Name $name
        Ensure-FirewallRule -AppPort $appPort
    } finally {
        Pop-Location
    }

    Show-Summary -AppPort $appPort -Email $email

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
    Stop-SetupLog
    if ($script:DryRunEnvPath -and (Test-Path -LiteralPath $script:DryRunEnvPath)) {
        Remove-Item -LiteralPath $script:DryRunEnvPath -Force -ErrorAction SilentlyContinue
    }
    if ($DryRun -and (Test-Path -LiteralPath $script:LogPath)) {
        Remove-Item -LiteralPath $script:LogPath -Force -ErrorAction SilentlyContinue
    }
}
exit $exitCode
