[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ArtifactDirectory,
    [ValidateSet('Runtime','App')][string]$Kind = 'Runtime',
    [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
if (!$IsWindows) {
    throw 'Windows release preflight must run on Windows.'
}

$artifactRoot = if ([IO.Path]::IsPathRooted($ArtifactDirectory)) {
    [IO.Path]::GetFullPath($ArtifactDirectory)
} else {
    [IO.Path]::GetFullPath((Join-Path (Get-Location) $ArtifactDirectory))
}
if (-not (Test-Path -LiteralPath $artifactRoot -PathType Container)) {
    throw "Windows artifact directory does not exist: $artifactRoot"
}
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path (Get-Location) '.runtime/windows-release-preflight.json'
} elseif (![IO.Path]::IsPathRooted($EvidencePath)) {
    $EvidencePath = Join-Path (Get-Location) $EvidencePath
}
$EvidencePath = [IO.Path]::GetFullPath($EvidencePath)

$blocked = [Collections.Generic.List[object]]::new()
$warnings = [Collections.Generic.List[object]]::new()

function Add-Blocked {
    param([string]$Code, [string]$Message)
    $blocked.Add([ordered]@{ level = 'BLOCKED'; code = $Code; message = $Message }) | Out-Null
}

function Add-Warning {
    param([string]$Code, [string]$Message)
    $warnings.Add([ordered]@{ level = 'WARNING'; code = $Code; message = $Message }) | Out-Null
}

function Read-JsonFile {
    param([string]$Path, [string]$ReasonCode)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Add-Blocked $ReasonCode "Missing JSON contract: $Path"
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        Add-Blocked $ReasonCode "Invalid JSON contract $Path`: $($_.Exception.Message)"
        return $null
    }
}

function Require-File {
    param([string]$Relative, [string]$ReasonCode = 'WINDOWS_REQUIRED_FILE_MISSING')
    $path = Join-Path $artifactRoot $Relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Blocked $ReasonCode "Missing required Windows artifact file: $Relative"
        return $null
    }
    if ((Get-Item -LiteralPath $path).Length -le 0) {
        Add-Blocked $ReasonCode "Required Windows artifact file is empty: $Relative"
        return $null
    }
    return $path
}

function Get-PEMachine {
    param([Parameter(Mandatory=$true)][string]$Path)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'missing MZ header' }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0 -or $peOffset + 6 -gt $stream.Length) { throw 'invalid PE header offset' }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) { throw 'missing PE signature' }
        return $reader.ReadUInt16()
    } finally {
        $stream.Dispose()
    }
}

function Get-PESubsystem {
    param([Parameter(Mandatory=$true)][string]$Path)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'missing MZ header' }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        $optionalHeader = $peOffset + 24
        if ($peOffset -lt 0 -or $optionalHeader + 70 -gt $stream.Length) { throw 'invalid PE optional header' }
        $stream.Position = $optionalHeader
        $magic = $reader.ReadUInt16()
        if ($magic -ne 0x010B -and $magic -ne 0x020B) { throw 'unsupported PE optional-header magic' }
        $stream.Position = $optionalHeader + 68
        return $reader.ReadUInt16()
    } finally {
        $stream.Dispose()
    }
}

function Get-SHA256Lower {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Compare-ProvenanceFile {
    param($Entry, [string]$ReasonPrefix)
    if ($null -eq $Entry -or [string]::IsNullOrWhiteSpace([string]$Entry.path)) {
        Add-Blocked ($ReasonPrefix + '_MISSING') "Provenance is missing the $ReasonPrefix file entry."
        return
    }
    $relative = ([string]$Entry.path).Replace('/','\')
    $path = Join-Path $artifactRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Blocked ($ReasonPrefix + '_MISSING') "Provenance file is missing from artifact: $($Entry.path)"
        return
    }
    $actual = Get-SHA256Lower $path
    if ([string]::IsNullOrWhiteSpace([string]$Entry.sha256) -or $actual -ne ([string]$Entry.sha256).ToLowerInvariant()) {
        Add-Blocked ($ReasonPrefix + '_HASH_MISMATCH') "SHA-256 does not match provenance for $($Entry.path)."
    }
}

$required = [ordered]@{
    cli = 'opendesk.exe'
    desktop = 'opendesk-desktop.exe'
    nativeUIHost = 'ui-host/opendesk-ui-host.exe'
    nativeUIProvenance = 'ui-host/build-provenance.json'
    builderTemplate = 'app-builder-template.json'
}
if ($Kind -eq 'App') {
    $required.appModeManifest = 'app-mode/opendesk.app.json'
    $required.appBuildProvenance = 'app-build-provenance.json'
} else {
    $required.distributionProvenance = 'distribution-provenance.json'
}

$paths = @{}
foreach ($entry in $required.GetEnumerator()) {
    $paths[$entry.Key] = Require-File $entry.Value
}

if ($null -ne $paths.cli -and $null -ne $paths.desktop) {
    $cliFull = [IO.Path]::GetFullPath($paths.cli)
    $desktopFull = [IO.Path]::GetFullPath($paths.desktop)
    if ([StringComparer]::OrdinalIgnoreCase.Equals($cliFull, $desktopFull)) {
        Add-Blocked 'WINDOWS_ENTRY_PATH_COLLISION' 'Desktop and CLI entries resolve to the same case-insensitive path.'
    }
}

$pe = [ordered]@{}
$expectedMachine = 0x8664
foreach ($role in @('cli','desktop','nativeUIHost')) {
    $path = $paths[$role]
    if ($null -eq $path) { continue }
    try {
        $machine = Get-PEMachine $path
        $subsystem = Get-PESubsystem $path
        $pe[$role] = [ordered]@{
            machine = ('0x{0:X4}' -f $machine)
            subsystem = $subsystem
        }
        if ($machine -ne $expectedMachine) {
            Add-Blocked 'WINDOWS_PE_MACHINE_MISMATCH' "$role PE machine is 0x$('{0:X4}' -f $machine), expected win-x64 0x8664."
        }
        if ($role -eq 'cli' -and $subsystem -ne 3) {
            Add-Blocked 'WINDOWS_CLI_SUBSYSTEM_INVALID' "opendesk.exe must use Console subsystem 3; actual=$subsystem."
        }
        if ($role -eq 'desktop' -and $subsystem -ne 2) {
            Add-Blocked 'WINDOWS_DESKTOP_SUBSYSTEM_INVALID' "opendesk-desktop.exe must use Windows GUI subsystem 2; actual=$subsystem."
        }
    } catch {
        Add-Blocked 'WINDOWS_PE_INVALID' "$role is not a valid expected PE artifact: $($_.Exception.Message)"
    }
}

$template = Read-JsonFile $paths.builderTemplate 'WINDOWS_BUILDER_TEMPLATE_INVALID'
if ($null -ne $template) {
    if ($template.schemaVersion -ne 1 -or $template.kind -ne 'opendesk-app-builder-template' -or $template.target -ne 'windows') {
        Add-Blocked 'WINDOWS_BUILDER_TEMPLATE_INVALID' 'app-builder-template.json does not declare the canonical Windows schema/kind/target.'
    }
}

$uiHostProvenance = Read-JsonFile $paths.nativeUIProvenance 'WINDOWS_UI_HOST_PROVENANCE_INVALID'
$uiHostContract = [ordered]@{}
if ($null -ne $uiHostProvenance) {
    $uiHostContract = [ordered]@{
        schemaVersion = $uiHostProvenance.schemaVersion
        runtime = $uiHostProvenance.runtime
        publish = $uiHostProvenance.publish
        webView2 = $uiHostProvenance.webView2
    }
    if ($uiHostProvenance.schemaVersion -lt 3 -or $uiHostProvenance.runtime -ne 'win-x64') {
        Add-Blocked 'WINDOWS_UI_HOST_PROVENANCE_INVALID' 'Native UI Host provenance must be schema >=3 for win-x64.'
    }
    if ($uiHostProvenance.publish.shape -ne 'self-contained-folder' -or
        $uiHostProvenance.publish.selfContained -ne $true -or
        $uiHostProvenance.publish.singleFile -ne $false -or
        $uiHostProvenance.publish.nativeLibrarySelfExtraction -ne $false) {
        Add-Blocked 'WINDOWS_UI_HOST_PUBLISH_CONTRACT_INVALID' 'Native UI Host must use the canonical self-contained folder publish contract without single-file native extraction.'
    }
    if ($uiHostProvenance.webView2.deployment -ne 'evergreen' -or
        $uiHostProvenance.webView2.runtimeBundled -ne $false -or
        [string]::IsNullOrWhiteSpace([string]$uiHostProvenance.webView2.sdkVersion)) {
        Add-Blocked 'WINDOWS_WEBVIEW2_DEPLOYMENT_CONTRACT_INVALID' 'Native UI Host must explicitly declare the Evergreen WebView2 deployment contract and SDK version.'
    }
    if ($null -ne $paths.nativeUIHost -and -not [string]::IsNullOrWhiteSpace([string]$uiHostProvenance.sha256)) {
        if ((Get-SHA256Lower $paths.nativeUIHost) -ne ([string]$uiHostProvenance.sha256).ToLowerInvariant()) {
            Add-Blocked 'WINDOWS_UI_HOST_HASH_MISMATCH' 'Native UI Host executable hash does not match its build provenance.'
        }
    }
    $actualClosureCount = @(Get-ChildItem -LiteralPath (Join-Path $artifactRoot 'ui-host') -File -Recurse).Count
    if ([int]$uiHostProvenance.fileCount -ne $actualClosureCount) {
        Add-Blocked 'WINDOWS_UI_HOST_CLOSURE_MISMATCH' "Native UI Host closure file count is $actualClosureCount; provenance records $($uiHostProvenance.fileCount)."
    }
}

$runtimeAssets = @(
    'resources/opendesk-notification.png',
    'sounds/public/done.mp3',
    'sounds/public/fail.mp3',
    'sounds/public/warn.mp3',
    'sounds/public/captcha.mp3',
    'inspector_web/index.html',
    'inspector_web/assets/app.css',
    'inspector_web/assets/app.js',
    'inspector_web/assets/model.js'
)
foreach ($relative in $runtimeAssets) {
    [void](Require-File $relative 'WINDOWS_RUNTIME_ASSET_MISSING')
}
foreach ($directory in @('polyfills','jslibs')) {
    $path = Join-Path $artifactRoot $directory
    $javascript = @()
    if (Test-Path -LiteralPath $path -PathType Container) {
        $javascript = @(Get-ChildItem -LiteralPath $path -Filter '*.js' -File)
    }
    if ($javascript.Count -lt 1) {
        Add-Blocked 'WINDOWS_RUNTIME_ASSET_MISSING' "Runtime JavaScript payload is missing or empty: $directory/"
    }
}

$runtimeVersion = $null
$provenanceKind = $null
if ($Kind -eq 'Runtime') {
    $distribution = Read-JsonFile $paths.distributionProvenance 'WINDOWS_DISTRIBUTION_PROVENANCE_INVALID'
    if ($null -ne $distribution) {
        $provenanceKind = $distribution.artifact
        $runtimeVersion = $distribution.runtimeCompatibilityVersion
        if ($distribution.schemaVersion -lt 2 -or
            $distribution.artifact -ne 'opendesk-windows-portable-distribution' -or
            $distribution.runtime -ne 'win-x64') {
            Add-Blocked 'WINDOWS_DISTRIBUTION_PROVENANCE_INVALID' 'Distribution provenance does not declare the canonical win-x64 portable Runtime contract.'
        }
        if ($distribution.layout.cliEntry -ne 'opendesk.exe' -or
            $distribution.layout.desktopEntry -ne 'opendesk-desktop.exe' -or
            $distribution.layout.nativeUIHost -ne 'ui-host/opendesk-ui-host.exe' -or
            $distribution.layout.appBuilderTemplate -ne 'app-builder-template.json') {
            Add-Blocked 'WINDOWS_DISTRIBUTION_LAYOUT_INVALID' 'Distribution provenance executable/layout roles do not match the canonical Windows contract.'
        }
        Compare-ProvenanceFile $distribution.files.runtime 'WINDOWS_RUNTIME'
        Compare-ProvenanceFile $distribution.files.desktopEntry 'WINDOWS_DESKTOP_ENTRY'
        Compare-ProvenanceFile $distribution.files.nativeUIHost 'WINDOWS_NATIVE_UI_HOST'
        Compare-ProvenanceFile $distribution.files.appBuilderTemplate 'WINDOWS_APP_BUILDER_TEMPLATE'
        foreach ($asset in @($distribution.files.runtimeAssets)) {
            Compare-ProvenanceFile $asset 'WINDOWS_RUNTIME_ASSET'
        }
        if ($distribution.files.runtime.peSubsystem -ne 3 -or $distribution.files.desktopEntry.peSubsystem -ne 2) {
            Add-Blocked 'WINDOWS_DISTRIBUTION_PE_PROVENANCE_INVALID' 'Distribution provenance records incorrect CLI/Desktop PE subsystem values.'
        }
    }
} else {
    $appBuild = Read-JsonFile $paths.appBuildProvenance 'WINDOWS_APP_BUILD_PROVENANCE_INVALID'
    $manifest = Read-JsonFile $paths.appModeManifest 'WINDOWS_APP_MODE_MANIFEST_INVALID'
    if ($null -ne $appBuild) {
        $provenanceKind = 'opendesk-installed-runtime-consumer-app'
        $runtimeVersion = $appBuild.runtime.version
        if ($appBuild.target -ne 'windows') {
            Add-Blocked 'WINDOWS_APP_BUILD_PROVENANCE_INVALID' 'Installed Runtime consumer provenance target must be windows.'
        }
        if ($null -ne $manifest -and $appBuild.package.id -ne $manifest.id) {
            Add-Blocked 'WINDOWS_APP_MODE_PROVENANCE_MISMATCH' 'Staged App Mode manifest id does not match App Builder provenance.'
        }
    }
}

# Evergreen is an explicit external prerequisite. Detection is informative for
# the current machine; absence does not rewrite the artifact contract or claim
# clean-machine qualification.
$webView2RegistryPaths = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
)
$webView2Version = $null
foreach ($registryPath in $webView2RegistryPaths) {
    try {
        $candidate = (Get-ItemProperty -LiteralPath $registryPath -Name 'pv' -ErrorAction Stop).pv
        if (-not [string]::IsNullOrWhiteSpace([string]$candidate) -and [string]$candidate -ne '0.0.0.0') {
            $webView2Version = [string]$candidate
            break
        }
    } catch {
        # Keep checking the other supported registration location.
    }
}
$webView2Detected = -not [string]::IsNullOrWhiteSpace($webView2Version)
if (-not $webView2Detected) {
    Add-Warning 'WINDOWS_WEBVIEW2_RUNTIME_NOT_DETECTED' 'Evergreen WebView2 Runtime was not detected on this machine; HTML/WebSurface readiness is blocked here and clean-machine qualification remains pending.'
}

$signingEntries = [ordered]@{}
$unsigned = $false
foreach ($role in @('cli','desktop','nativeUIHost')) {
    $path = $paths[$role]
    if ($null -eq $path) { continue }
    try {
        $signature = Get-AuthenticodeSignature -LiteralPath $path
        $signingEntries[$role] = [ordered]@{
            status = [string]$signature.Status
            publisher = if ($null -ne $signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { $null }
            thumbprint = if ($null -ne $signature.SignerCertificate) { [string]$signature.SignerCertificate.Thumbprint } else { $null }
            timestampPublisher = if ($null -ne $signature.TimeStamperCertificate) { [string]$signature.TimeStamperCertificate.Subject } else { $null }
        }
        if ($signature.Status -ne 'Valid') {
            $unsigned = $true
        }
    } catch {
        $unsigned = $true
        $signingEntries[$role] = [ordered]@{ status = 'Unknown'; error = $_.Exception.Message }
    }
}
if ($unsigned) {
    Add-Warning 'WINDOWS_AUTHENTICODE_NOT_RELEASE_QUALIFIED' 'One or more executables do not have a valid Authenticode publisher signature. Internal CI artifacts may proceed; consumer release qualification remains pending.'
}

$hashes = [ordered]@{}
foreach ($role in @('cli','desktop','nativeUIHost')) {
    if ($null -ne $paths[$role]) {
        $hashes[$role] = Get-SHA256Lower $paths[$role]
    }
}

$status = if ($blocked.Count -gt 0) { 'BLOCKED' } elseif ($warnings.Count -gt 0) { 'WARNING' } else { 'READY' }
$reasons = @()
$reasons += @($blocked)
$reasons += @($warnings)
$report = [ordered]@{
    schemaVersion = 1
    status = $status
    target = 'windows'
    kind = $Kind.ToLowerInvariant()
    artifactRoot = $artifactRoot
    provenanceKind = $provenanceKind
    runtimeVersion = $runtimeVersion
    architecture = 'win-x64'
    currentMachine = [ordered]@{
        osVersion = [Environment]::OSVersion.VersionString
        processArchitecture = [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    }
    layout = [ordered]@{
        cliEntry = 'opendesk.exe'
        desktopEntry = 'opendesk-desktop.exe'
        nativeUIHost = 'ui-host/opendesk-ui-host.exe'
    }
    pe = $pe
    hashes = $hashes
    nativeUIHost = $uiHostContract
    webView2 = [ordered]@{
        deployment = 'evergreen'
        runtimeBundled = $false
        runtimeDetected = $webView2Detected
        detectedVersion = $webView2Version
        htmlWebSurfaceReadiness = if ($webView2Detected) { 'READY_FOR_HOSTED_CHECKS' } else { 'BLOCKED_ON_THIS_MACHINE' }
        cleanMachineQualification = 'PENDING'
    }
    signing = [ordered]@{
        releaseQualified = (-not $unsigned)
        entries = $signingEntries
    }
    interactiveQualification = 'PENDING'
    reasons = $reasons
    recordedAt = [DateTimeOffset]::UtcNow.ToString('O')
}

$evidenceDirectory = Split-Path -Parent $EvidencePath
if (-not [string]::IsNullOrWhiteSpace($evidenceDirectory)) {
    New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
}
$json = $report | ConvertTo-Json -Depth 12
$json | Set-Content -LiteralPath $EvidencePath -Encoding utf8
$json

if ($status -eq 'BLOCKED') {
    exit 1
}
exit 0
