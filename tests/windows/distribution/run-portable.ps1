[CmdletBinding()]
param(
    [string]$DistributionDirectory = 'dist/windows/win-x64',
    [string]$EvidenceDirectory = '.runtime/tests/windows-compat'
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))

if (!$IsWindows) {
    throw 'Portable Windows distribution validation must run on Windows.'
}

if (![IO.Path]::IsPathRooted($DistributionDirectory)) {
    $DistributionDirectory = Join-Path $root $DistributionDirectory
}
if (![IO.Path]::IsPathRooted($EvidenceDirectory)) {
    $EvidenceDirectory = Join-Path $root $EvidenceDirectory
}
$DistributionDirectory = [IO.Path]::GetFullPath($DistributionDirectory)
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null

function Get-PEMachine {
    param([Parameter(Mandatory=$true)][string]$Path)

    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) {
            throw "$Path is not a PE executable."
        }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0 -or $peOffset + 6 -gt $stream.Length) {
            throw "$Path has an invalid PE header offset."
        }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) {
            throw "$Path is missing the PE signature."
        }
        return $reader.ReadUInt16()
    } finally {
        $stream.Dispose()
    }
}

function Invoke-OpenDesk {
    param(
        [Parameter(Mandatory=$true)][string]$RuntimePath,
        [Parameter(Mandatory=$true)][string[]]$Arguments
    )

    $output = (& $RuntimePath @Arguments 2>&1 | Out-String)
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = $output
    }
}

$evidence = [ordered]@{
    schemaVersion = 2
    suite = 'windows-portable-distribution'
    status = 'running'
    distribution = $DistributionDirectory
    checks = [ordered]@{
        requiredFiles = $false
        architecture = $false
        provenance = $false
        runtimeAssetClosure = $false
        unicodeAndSpacePath = $false
        nonRepositoryWorkingDirectory = $false
        runtimeLaunch = $false
        customUIRuntimeHostDiscovery = $false
        nativeUIHostProtocol = 'covered-by-windows-core-native-host-smoke'
        missingHostFailsClearly = $false
    }
    githubSHA = $env:GITHUB_SHA
    osVersion = [Environment]::OSVersion.VersionString
    processArchitecture = [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    recordedAt = [DateTimeOffset]::UtcNow.ToString('O')
}

$tempRoot = $null
try {
    $runtimePath = Join-Path $DistributionDirectory 'opendesk.exe'
    $uiHostPath = Join-Path $DistributionDirectory 'ui-host/opendesk-ui-host.exe'
    $uiHostProvenancePath = Join-Path $DistributionDirectory 'ui-host/build-provenance.json'
    $distributionProvenancePath = Join-Path $DistributionDirectory 'distribution-provenance.json'

    foreach ($required in @($runtimePath, $uiHostPath, $uiHostProvenancePath, $distributionProvenancePath)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Distribution required file is missing: $required"
        }
    }
    $evidence.checks.requiredFiles = $true

    $expectedMachine = 0x8664
    $runtimeMachine = Get-PEMachine -Path $runtimePath
    $uiHostMachine = Get-PEMachine -Path $uiHostPath
    if ($runtimeMachine -ne $expectedMachine -or $uiHostMachine -ne $expectedMachine) {
        throw ('Distribution architecture mismatch: runtime=0x{0:X4}, uiHost=0x{1:X4}, expected=0x8664.' -f $runtimeMachine, $uiHostMachine)
    }
    $evidence.checks.architecture = $true

    $distributionProvenance = Get-Content -LiteralPath $distributionProvenancePath -Raw | ConvertFrom-Json
    $uiHostProvenance = Get-Content -LiteralPath $uiHostProvenancePath -Raw | ConvertFrom-Json
    if ($distributionProvenance.schemaVersion -ne 2 -or
        $distributionProvenance.runtime -ne 'win-x64' -or
        $distributionProvenance.runtimeGOARCH -ne 'amd64' -or
        $distributionProvenance.uiHostRuntime -ne 'win-x64' -or
        $uiHostProvenance.runtime -ne 'win-x64') {
        throw 'Distribution provenance does not describe one consistent win-x64 application.'
    }
    if ($env:GITHUB_SHA -and $distributionProvenance.sourceCommit -ne $env:GITHUB_SHA) {
        throw "Distribution provenance sourceCommit '$($distributionProvenance.sourceCommit)' does not match GITHUB_SHA '$env:GITHUB_SHA'."
    }
    $evidence.checks.provenance = $true

    $runtimeAssets = @($distributionProvenance.files.runtimeAssets)
    if ($runtimeAssets.Count -eq 0) {
        throw 'Distribution provenance does not declare its Runtime asset closure.'
    }
    $requiredRuntimeAssetPaths = @(
        'polyfills/000-global.js',
        'polyfills/006-ui.js',
        'jslibs/lodash.min.js',
        'resources/opendesk-notification.png',
        'sounds/public/done.mp3',
        'sounds/public/fail.mp3',
        'sounds/public/warn.mp3',
        'sounds/public/captcha.mp3'
    )
    $manifestAssetPaths = @($runtimeAssets | ForEach-Object { [string]$_.path })
    foreach ($requiredAssetPath in $requiredRuntimeAssetPaths) {
        if ($manifestAssetPaths -notcontains $requiredAssetPath) {
            throw "Distribution Runtime asset manifest is missing: $requiredAssetPath"
        }
    }
    $distributionPrefix = $DistributionDirectory.TrimEnd('\') + '\'
    foreach ($asset in $runtimeAssets) {
        $relativeAssetPath = [string]$asset.path
        $expectedAssetHash = [string]$asset.sha256
        if ([string]::IsNullOrWhiteSpace($relativeAssetPath) -or [IO.Path]::IsPathRooted($relativeAssetPath)) {
            throw "Distribution Runtime asset path is not a safe relative path: $relativeAssetPath"
        }
        $assetPath = [IO.Path]::GetFullPath((Join-Path $DistributionDirectory $relativeAssetPath))
        if (-not $assetPath.StartsWith($distributionPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Distribution Runtime asset escapes the distribution directory: $relativeAssetPath"
        }
        if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
            throw "Distribution Runtime asset is missing: $relativeAssetPath"
        }
        $actualAssetHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($expectedAssetHash) -or $actualAssetHash -ne $expectedAssetHash.ToLowerInvariant()) {
            throw "Distribution Runtime asset hash mismatch: $relativeAssetPath"
        }
    }
    $evidence.runtimeAssetCount = $runtimeAssets.Count
    $evidence.checks.runtimeAssetClosure = $true

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('OpenDesk portable 验证 ' + [Guid]::NewGuid().ToString('N'))
    $copiedDistribution = Join-Path $tempRoot 'OpenDesk 应用 with spaces'
    $foreignWorkingDirectory = Join-Path $tempRoot '非仓库工作目录'
    New-Item -ItemType Directory -Force -Path $copiedDistribution | Out-Null
    New-Item -ItemType Directory -Force -Path $foreignWorkingDirectory | Out-Null
    Copy-Item -Path (Join-Path $DistributionDirectory '*') -Destination $copiedDistribution -Recurse -Force

    $copiedRuntime = Join-Path $copiedDistribution 'opendesk.exe'
    $copiedHostDirectory = Join-Path $copiedDistribution 'ui-host'
    if (-not (Test-Path -LiteralPath $copiedRuntime -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $copiedHostDirectory 'opendesk-ui-host.exe') -PathType Leaf)) {
        throw 'Unicode/space-path distribution copy is incomplete.'
    }
    foreach ($asset in $runtimeAssets) {
        if (-not (Test-Path -LiteralPath (Join-Path $copiedDistribution ([string]$asset.path)) -PathType Leaf)) {
            throw "Unicode/space-path distribution copy is missing Runtime asset: $($asset.path)"
        }
    }
    $evidence.checks.unicodeAndSpacePath = $true

    $runtimeProbe = @'
if (typeof ui !== "object" || typeof ui.getCapabilities !== "function") {
  throw new Error("UI_POLYFILL_NOT_INITIALIZED");
}
if (typeof _ !== "function" || _.VERSION !== "4.17.21") {
  throw new Error("JSLIBS_NOT_INITIALIZED");
}
console.log("OPENDESK_DISTRIBUTION_RUNTIME_OK");
'@
    $customUIProbe = @'
const capabilities = ui.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error("CUSTOM_UI_UNAVAILABLE=" + (capabilities.reason || "unknown"));
}
const panel = await ui.createWindow({
  id: "windowsDistributionSmoke",
  kind: "floating",
  title: "",
  position: {
    mode: "anchor",
    size: { width: 260, height: 120 },
    horizontal: "center",
    vertical: "center",
    margin: 0,
    display: "active"
  },
  alwaysOnTop: false,
  draggable: false,
  theme: "dark",
  content: {
    html: "<!doctype html><html><body><p id=\"status\">OpenDesk distribution smoke</p></body></html>"
  }
});
await panel.show();
await panel.close();
console.log("OPENDESK_DISTRIBUTION_UI_OK");
'@

    Push-Location $foreignWorkingDirectory
    try {
        $basic = Invoke-OpenDesk -RuntimePath $copiedRuntime -Arguments @(
            '-script-text', $runtimeProbe,
            '-console-mode', 'script'
        )
        if ($basic.ExitCode -ne 0 -or $basic.Output -notmatch 'OPENDESK_DISTRIBUTION_RUNTIME_OK') {
            throw "Portable runtime launch failed from non-repository cwd. exit=$($basic.ExitCode) output=$($basic.Output)"
        }
        $evidence.checks.runtimeLaunch = $true
        $evidence.checks.nonRepositoryWorkingDirectory = $true

        $customUI = Invoke-OpenDesk -RuntimePath $copiedRuntime -Arguments @(
            '-ui',
            '-script-text', $customUIProbe,
            '-console-mode', 'script'
        )
        if ($customUI.ExitCode -ne 0 -or $customUI.Output -notmatch 'OPENDESK_DISTRIBUTION_UI_OK') {
            throw "Portable Custom UI launch failed. exit=$($customUI.ExitCode) output=$($customUI.Output)"
        }
        $evidence.checks.customUIRuntimeHostDiscovery = $true

        $missingDirectory = Join-Path $copiedDistribution 'ui-host.missing'
        Rename-Item -LiteralPath $copiedHostDirectory -NewName 'ui-host.missing'
        try {
            $missingHost = Invoke-OpenDesk -RuntimePath $copiedRuntime -Arguments @(
                '-ui',
                '-script-text', $customUIProbe,
                '-console-mode', 'script'
            )
            if ($missingHost.ExitCode -eq 0) {
                throw 'Custom UI unexpectedly succeeded after the bundled ui-host directory was removed.'
            }
            if ($missingHost.Output -notmatch '(?is)(custom UI host|opendesk-ui-host|clawdesk-ui-host).*(not found|was not found)') {
                throw "Missing-host failure was not explicit. output=$($missingHost.Output)"
            }
            $evidence.checks.missingHostFailsClearly = $true
        } finally {
            if (Test-Path -LiteralPath $missingDirectory) {
                Rename-Item -LiteralPath $missingDirectory -NewName 'ui-host'
            }
        }
    } finally {
        Pop-Location
    }

    $evidence.status = 'passed'
} catch {
    $evidence.status = 'failed'
    $evidence.error = $_.Exception.Message
    throw
} finally {
    $evidence.recordedAt = [DateTimeOffset]::UtcNow.ToString('O')
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $EvidenceDirectory 'portable-distribution.json')
    if ($tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
