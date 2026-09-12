[CmdletBinding()]
param(
    [ValidateSet('win-x64','win-arm64')][string]$Runtime = 'win-x64',
    [string]$OutputDirectory = '',
    [string]$AppModePackage = '',
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $root 'VERSION'
if ([string]::IsNullOrWhiteSpace($Version)) {
    if (-not [string]::IsNullOrWhiteSpace($env:VERSION)) {
        $Version = $env:VERSION.Trim()
    } elseif (Test-Path -LiteralPath $versionFile -PathType Leaf) {
        $Version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    } else {
        throw "Runtime version source is missing: $versionFile"
    }
}
if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$') {
    throw "Version must be SemVer without a leading v: $Version"
}
$runtimeVersionLdflags = "-X opendesk/pkg/runtimeversion.Current=$Version"

if (!$IsWindows) {
    throw 'Build the complete OpenDesk Windows application on Windows with Go, its native C toolchain, and the .NET 8 SDK.'
}
if ($Runtime -ne 'win-x64') {
    throw 'The complete OpenDesk Windows application is currently supported and verified only for win-x64. build_windows_ui.ps1 may publish the UI host alone for win-arm64 experiments, but that does not establish whole-application ARM64 support.'
}
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [Runtime.InteropServices.Architecture]::X64) {
    throw 'The verified win-x64 application build currently requires an x64 Windows builder so Go/CGO/native dependencies cannot be mixed across architectures.'
}

if (!$OutputDirectory) {
    $OutputDirectory = Join-Path $root 'dist'
} elseif (![IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $root $OutputDirectory
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$driveRoot = [IO.Path]::GetPathRoot($OutputDirectory)
if ($OutputDirectory.TrimEnd('\') -eq [IO.Path]::GetFullPath($root).TrimEnd('\') -or
    $OutputDirectory.TrimEnd('\') -eq $driveRoot.TrimEnd('\')) {
    throw "Refusing unsafe Windows build output directory: $OutputDirectory"
}

$runtimePath = Join-Path $OutputDirectory 'opendesk.exe'
$uiOutputDirectory = Join-Path $OutputDirectory 'ui-host'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$previousGOOS = $env:GOOS
$previousGOARCH = $env:GOARCH

Push-Location $root
try {
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'

    & go build -trimpath -ldflags $runtimeVersionLdflags -o $runtimePath ./cmd/opendesk
    if ($LASTEXITCODE -ne 0) {
        throw "OpenDesk main Windows build failed ($LASTEXITCODE)."
    }
    if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) {
        throw "OpenDesk runtime was not produced at $runtimePath"
    }

    & ./scripts/build_windows_ui.ps1 -Runtime 'win-x64' -OutputDirectory $uiOutputDirectory
    if ($LASTEXITCODE -ne 0) {
        throw "OpenDesk UI host build failed ($LASTEXITCODE)."
    }

    $uiHostPath = Join-Path $uiOutputDirectory 'opendesk-ui-host.exe'
    if (-not (Test-Path -LiteralPath $uiHostPath -PathType Leaf)) {
        throw "OpenDesk UI host was not produced at $uiHostPath"
    }

    if ($AppModePackage) {
        if (![IO.Path]::IsPathRooted($AppModePackage)) {
            $AppModePackage = Join-Path $root $AppModePackage
        }
        $AppModePackage = [IO.Path]::GetFullPath($AppModePackage)
        if (-not (Test-Path -LiteralPath $AppModePackage -PathType Container)) {
            throw "App Mode package directory does not exist: $AppModePackage"
        }
        $appManifest = Join-Path $AppModePackage 'opendesk.app.json'
        if (-not (Test-Path -LiteralPath $appManifest -PathType Leaf)) {
            throw "App Mode package must contain opendesk.app.json: $AppModePackage"
        }
        $appModeOutput = Join-Path $OutputDirectory 'app-mode'
        New-Item -ItemType Directory -Force -Path $appModeOutput | Out-Null
        Copy-Item -Path (Join-Path $AppModePackage '*') -Destination $appModeOutput -Recurse -Force
        Write-Host "Staged default App Mode package: $appModeOutput"
    }

    Write-Host "OpenDesk Windows runtime: $runtimePath"
    Write-Host "OpenDesk Windows UI host: $uiHostPath"
    Write-Host "Runtime compatibility version: $Version"
} finally {
    if ($null -eq $previousGOOS) {
        Remove-Item Env:GOOS -ErrorAction SilentlyContinue
    } else {
        $env:GOOS = $previousGOOS
    }
    if ($null -eq $previousGOARCH) {
        Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    } else {
        $env:GOARCH = $previousGOARCH
    }
    Pop-Location
}
