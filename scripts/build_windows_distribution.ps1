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

if (!$IsWindows) {
    throw 'Build the portable Windows distribution on Windows.'
}
if ($Runtime -ne 'win-x64') {
    throw 'Portable OpenDesk Windows distributions are currently supported and verified only for win-x64. Windows ARM64 remains unverified until the Go/CGO/native dependency chain is validated end to end.'
}
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [Runtime.InteropServices.Architecture]::X64) {
    throw 'The verified win-x64 distribution build currently requires an x64 Windows builder.'
}

if (!$OutputDirectory) {
    $OutputDirectory = Join-Path $root 'dist/windows/win-x64'
} elseif (![IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $root $OutputDirectory
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$repoRoot = [IO.Path]::GetFullPath($root)
$driveRoot = [IO.Path]::GetPathRoot($OutputDirectory)
if ($OutputDirectory.TrimEnd('\') -eq $repoRoot.TrimEnd('\') -or
    $OutputDirectory.TrimEnd('\') -eq $driveRoot.TrimEnd('\')) {
    throw "Refusing unsafe distribution output directory: $OutputDirectory"
}

function Get-PEMachine {
    param([Parameter(Mandatory=$true)][string]$Path)

    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) {
            throw "$Path is not a PE executable (missing MZ header)."
        }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0 -or $peOffset + 6 -gt $stream.Length) {
            throw "$Path has an invalid PE header offset."
        }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) {
            throw "$Path is not a PE executable (missing PE signature)."
        }
        return $reader.ReadUInt16()
    } finally {
        $stream.Dispose()
    }
}

if (Test-Path -LiteralPath $OutputDirectory) {
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
$appModeStaged = [bool]$AppModePackage
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

Push-Location $root
try {
    $appBuildArguments = @{
        Runtime = 'win-x64'
        OutputDirectory = $OutputDirectory
        Version = $Version
    }
    if ($AppModePackage) {
        $appBuildArguments.AppModePackage = $AppModePackage
    }
    & ./scripts/build_windows_app.ps1 @appBuildArguments
    if ($LASTEXITCODE -ne 0) {
        throw "OpenDesk Windows application build failed ($LASTEXITCODE)."
    }

    # Keep the Runtime-owned asset closure here, beside the canonical
    # distribution assembly step. The Runtime resolves polyfills/jslibs from
    # the executable directory, the notification icon from resources/, and
    # predefined sounds from sounds/public/.
    $runtimeAssetManifest = [Collections.Generic.List[object]]::new()
    foreach ($assetDirectoryName in @('polyfills', 'jslibs')) {
        $sourceAssetDirectory = Join-Path $root $assetDirectoryName
        if (-not (Test-Path -LiteralPath $sourceAssetDirectory -PathType Container)) {
            throw "Runtime asset source directory is missing: $sourceAssetDirectory"
        }
        $sourceAssetFiles = @(Get-ChildItem -LiteralPath $sourceAssetDirectory -File |
            Where-Object { $_.Extension -eq '.js' } |
            Sort-Object -Property Name)
        if ($sourceAssetFiles.Count -eq 0) {
            throw "Runtime asset source directory contains no JavaScript files: $sourceAssetDirectory"
        }
        $destinationAssetDirectory = Join-Path $OutputDirectory $assetDirectoryName
        New-Item -ItemType Directory -Force -Path $destinationAssetDirectory | Out-Null
        foreach ($sourceAssetFile in $sourceAssetFiles) {
            $destinationAssetPath = Join-Path $destinationAssetDirectory $sourceAssetFile.Name
            Copy-Item -LiteralPath $sourceAssetFile.FullName -Destination $destinationAssetPath -Force
            $sourceHash = (Get-FileHash -LiteralPath $sourceAssetFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            $destinationHash = (Get-FileHash -LiteralPath $destinationAssetPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($destinationHash -ne $sourceHash) {
                throw "Runtime asset hash mismatch after staging: $destinationAssetPath"
            }
            $runtimeAssetManifest.Add([ordered]@{
                path = ($assetDirectoryName + '/' + $sourceAssetFile.Name)
                sha256 = $destinationHash
            })
        }
    }

    $runtimeAssetFiles = @(
        [ordered]@{ source = 'public/icons/opendesk-notification.png'; destination = 'resources/opendesk-notification.png' },
        [ordered]@{ source = 'public/done.mp3'; destination = 'sounds/public/done.mp3' },
        [ordered]@{ source = 'public/fail.mp3'; destination = 'sounds/public/fail.mp3' },
        [ordered]@{ source = 'public/warn.mp3'; destination = 'sounds/public/warn.mp3' },
        [ordered]@{ source = 'public/captcha.mp3'; destination = 'sounds/public/captcha.mp3' }
    )
    foreach ($asset in $runtimeAssetFiles) {
        $sourceAssetPath = Join-Path $root $asset.source
        if (-not (Test-Path -LiteralPath $sourceAssetPath -PathType Leaf)) {
            throw "Runtime asset source file is missing: $sourceAssetPath"
        }
        $destinationAssetPath = Join-Path $OutputDirectory $asset.destination
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destinationAssetPath) | Out-Null
        Copy-Item -LiteralPath $sourceAssetPath -Destination $destinationAssetPath -Force
        $sourceHash = (Get-FileHash -LiteralPath $sourceAssetPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $destinationHash = (Get-FileHash -LiteralPath $destinationAssetPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($destinationHash -ne $sourceHash) {
            throw "Runtime asset hash mismatch after staging: $destinationAssetPath"
        }
        $runtimeAssetManifest.Add([ordered]@{
            path = $asset.destination
            sha256 = $destinationHash
        })
    }

    $runtimePath = Join-Path $OutputDirectory 'opendesk.exe'
    $uiHostDirectory = Join-Path $OutputDirectory 'ui-host'
    $uiHostPath = Join-Path $uiHostDirectory 'opendesk-ui-host.exe'
    $uiHostProvenancePath = Join-Path $uiHostDirectory 'build-provenance.json'

    $requiredRuntimeAssets = @($runtimeAssetManifest | ForEach-Object { Join-Path $OutputDirectory $_.path })
    foreach ($required in @($runtimePath, $uiHostPath, $uiHostProvenancePath) + $requiredRuntimeAssets) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Portable distribution is missing required file: $required"
        }
    }

    $expectedMachine = 0x8664
    $runtimeMachine = Get-PEMachine -Path $runtimePath
    $uiHostMachine = Get-PEMachine -Path $uiHostPath
    if ($runtimeMachine -ne $expectedMachine) {
        throw ('OpenDesk runtime architecture mismatch: PE machine=0x{0:X4}, expected x64 0x8664.' -f $runtimeMachine)
    }
    if ($uiHostMachine -ne $expectedMachine) {
        throw ('Native UI host architecture mismatch: PE machine=0x{0:X4}, expected x64 0x8664.' -f $uiHostMachine)
    }

    $uiHostProvenance = Get-Content -LiteralPath $uiHostProvenancePath -Raw | ConvertFrom-Json
    if ($uiHostProvenance.runtime -ne 'win-x64') {
        throw "Native UI host provenance runtime is '$($uiHostProvenance.runtime)', expected win-x64."
    }

    $sourceCommit = (& git rev-parse HEAD).Trim()
    $sourceDirty = @(& git status --porcelain).Count -gt 0
    $goVersion = (& go version).Trim()
    $dotnetVersion = (& dotnet --version).Trim()
    $runtimeHash = (Get-FileHash $runtimePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $uiHostHash = (Get-FileHash $uiHostPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $uiHostFileCount = @(Get-ChildItem -LiteralPath $uiHostDirectory -File -Recurse).Count

    [ordered]@{
        schemaVersion = 2
        artifact = 'opendesk-windows-portable-distribution'
        sourceCommit = $sourceCommit
        sourceDirty = $sourceDirty
        runtimeCompatibilityVersion = $Version
        runtime = 'win-x64'
        runtimeGOOS = 'windows'
        runtimeGOARCH = 'amd64'
        uiHostRuntime = 'win-x64'
        architecturePolicy = 'win-x64-supported-and-verified; win-arm64-unverified'
        layout = [ordered]@{
            runtime = 'opendesk.exe'
            nativeUIHost = 'ui-host/opendesk-ui-host.exe'
            nativeUIHostClosure = 'ui-host/'
            runtimeAssets = [ordered]@{
                polyfills = 'polyfills/'
                javascriptLibraries = 'jslibs/'
                notificationIcon = 'resources/opendesk-notification.png'
                predefinedSounds = 'sounds/public/'
            }
            appModePackage = if ($appModeStaged) { 'app-mode/' } else { $null }
        }
        files = [ordered]@{
            runtime = [ordered]@{
                path = 'opendesk.exe'
                sha256 = $runtimeHash
                peMachine = ('0x{0:X4}' -f $runtimeMachine)
                compatibilityVersion = $Version
            }
            nativeUIHost = [ordered]@{
                path = 'ui-host/opendesk-ui-host.exe'
                sha256 = $uiHostHash
                peMachine = ('0x{0:X4}' -f $uiHostMachine)
                closureFileCount = $uiHostFileCount
            }
            runtimeAssets = @($runtimeAssetManifest)
        }
        toolchain = [ordered]@{
            go = $goVersion
            dotnet = $dotnetVersion
        }
        canonicalCommand = 'pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64'
        builtAt = [DateTimeOffset]::UtcNow.ToString('O')
    } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory 'distribution-provenance.json')

    Write-Host "Portable Windows distribution: $OutputDirectory"
    Write-Host "Runtime compatibility version: $Version"
    Write-Host 'Architecture policy: win-x64 verified; win-arm64 unverified.'
} finally {
    Pop-Location
}
