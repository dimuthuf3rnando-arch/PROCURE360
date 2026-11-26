#requires -Version 5.1
<#
.SYNOPSIS
    Remove the PROCURE360 Windows service and firewall rule.

.DESCRIPTION
    By default the data folder is kept so the register can be backed up or
    restored later. Use -RemoveData to delete it as well.

.PARAMETER RemoveData
    Delete the data folder (database and backups) after stopping the service.

.PARAMETER Force
    Do not ask for confirmation when -RemoveData is used.

.PARAMETER NoElevate
    Do not request administrator rights automatically.
#>
[CmdletBinding()]
param(
    [switch]$RemoveData,
    [switch]$Force,
    [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'
$script:Root = $PSScriptRoot
$script:EnvPath = Join-Path $script:Root '.env'
$script:DataDir = Join-Path $script:Root 'data'
$script:ServiceName = 'PROCURE360'

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $NoElevate -and -not (Test-IsAdmin)) {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }
    $forward = @()
    if ($RemoveData) { $forward += '-RemoveData' }
    if ($Force) { $forward += '-Force' }
    $argList = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$scriptPath`""
    ) + $forward
    try {
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList $argList
        exit $process.ExitCode
    } catch {
        Write-Host 'Administrator permission is required to remove the service.' -ForegroundColor Red
        exit 2
    }
}

function Get-EnvValue {
    param([string]$Key, [string]$Default = '')
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

Write-Host ''
Write-Host '  PROCURE360 - uninstall' -ForegroundColor White
Write-Host ''

$service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne 'Stopped') {
        Write-Host '  Stopping the service...' -ForegroundColor Gray
        Stop-Service -Name $script:ServiceName -Force -ErrorAction SilentlyContinue
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
    Write-Host '  Removing the service registration...' -ForegroundColor Gray
    & sc.exe delete $script:ServiceName | Out-Null
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline -and (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 200
    }
    Write-Host '  Service removed.' -ForegroundColor Green
} else {
    Write-Host '  The PROCURE360 service is not installed.' -ForegroundColor Gray
}

try {
    $rules = Get-NetFirewallRule -DisplayName 'PROCURE360 (TCP *)' -ErrorAction SilentlyContinue
    if ($rules) {
        $rules | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        Write-Host "  PROCURE360 firewall rules removed." -ForegroundColor Green
    }
} catch {
    Write-Host "  Could not inspect the firewall rules: $($_.Exception.Message)" -ForegroundColor Yellow
}

if ($RemoveData) {
    if (-not $Force) {
        $answer = Read-Host "Delete $script:DataDir and all database backups? Type DELETE to confirm"
        if ($answer -ne 'DELETE') {
            Write-Host '  Data kept.' -ForegroundColor Yellow
            $RemoveData = $false
        }
    }
    if ($RemoveData -and (Test-Path -LiteralPath $script:DataDir)) {
        Remove-Item -LiteralPath $script:DataDir -Recurse -Force
        Write-Host '  Data folder deleted.' -ForegroundColor Green
    }
} elseif (Test-Path -LiteralPath $script:DataDir) {
    Write-Host "  Data kept in: $script:DataDir" -ForegroundColor Gray
}

Write-Host ''
Write-Host 'Uninstall complete. You can now delete this folder.' -ForegroundColor Green
if (-not $Force) {
    Read-Host 'Press Enter to close' | Out-Null
}
