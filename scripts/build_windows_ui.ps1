# Build or cross-publish the Windows native UI sidecar. Run from any working directory:
# pwsh -NoProfile -File scripts/build_windows_ui.ps1
# This is a host-only build. win-arm64 output does not imply whole-OpenDesk ARM64 support.
[CmdletBinding()]
param(
    [ValidateSet('win-x64','win-arm64')][string]$Runtime = 'win-x64',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $root 'pkg/customui/winhost/OpenDesk.UIHost.csproj'

if (!$OutputDirectory) {
    $OutputDirectory = Join-Path $root 'dist/ui-host'
} elseif (![IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $root $OutputDirectory
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$driveRoot = [IO.Path]::GetPathRoot($OutputDirectory)
if ($OutputDirectory.TrimEnd('\') -eq [IO.Path]::GetFullPath($root).TrimEnd('\') -or
    $OutputDirectory.TrimEnd('\') -eq $driveRoot.TrimEnd('\')) {
    throw "Refusing unsafe Windows UI output directory: $OutputDirectory"
}

if ($Runtime -eq 'win-arm64') {
    Write-Warning 'Publishing the Native UI Host for win-arm64 only. The OpenDesk runtime/distribution remains unverified and unsupported for Windows ARM64.'
}

$webView2Reference = Select-Xml -Path $projectPath -XPath "//PackageReference[@Include='Microsoft.Web.WebView2']"
if ($null -eq $webView2Reference -or [string]::IsNullOrWhiteSpace($webView2Reference.Node.Version)) {
    throw 'Microsoft.Web.WebView2 PackageReference/version is missing from the Native UI Host project.'
}
$webView2SDKVersion = [string]$webView2Reference.Node.Version

$buildRoot = Join-Path $root ('.runtime/build/windows-ui/' + $Runtime)
$stage = Join-Path $buildRoot 'publish'
$artifacts = Join-Path $buildRoot 'artifacts'

if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}
if (Test-Path -LiteralPath $OutputDirectory) {
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

Push-Location $root
try {
    & dotnet publish $projectPath `
        -c Release `
        -r $Runtime `
        --self-contained true `
        -o $stage `
        --artifacts-path $artifacts `
        '-p:ContinuousIntegrationBuild=true'
    if ($LASTEXITCODE -ne 0) {
        throw "Windows native UI publish failed ($LASTEXITCODE)"
    }

    Copy-Item -Path (Join-Path $stage '*') -Destination $OutputDirectory -Recurse -Force

    $hostPath = Join-Path $OutputDirectory 'opendesk-ui-host.exe'
    if (-not (Test-Path -LiteralPath $hostPath -PathType Leaf)) {
        throw "Windows native UI host was not produced at $hostPath"
    }
    foreach ($dependency in @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
        $dependencyPath = Join-Path $OutputDirectory $dependency
        if (-not (Test-Path -LiteralPath $dependencyPath -PathType Leaf)) {
            throw "Windows native UI host publish is missing WebView2 SDK dependency: $dependency"
        }
    }
    $webView2Loaders = @(Get-ChildItem -LiteralPath $OutputDirectory -Filter 'WebView2Loader.dll' -File -Recurse)
    if ($webView2Loaders.Count -lt 1) {
        throw 'Windows native UI host publish is missing WebView2Loader.dll.'
    }

    $sha = (& git rev-parse HEAD).Trim()
    $dirty = @(& git status --porcelain).Count -gt 0
    $hash = (Get-FileHash $hostPath -Algorithm SHA256).Hash.ToLowerInvariant()
    # build-provenance.json is written immediately below and belongs to the final published closure.
    $fileCount = @(Get-ChildItem -LiteralPath $OutputDirectory -File -Recurse).Count + 1
    $loaderPaths = @($webView2Loaders | ForEach-Object {
        [IO.Path]::GetRelativePath($OutputDirectory, $_.FullName).Replace('\','/')
    } | Sort-Object)

    [ordered]@{
        schemaVersion = 3
        artifact = 'opendesk-native-ui-host'
        sourceCommit = $sha
        sourceDirty = $dirty
        protocolVersion = '1.9.0'
        runtime = $Runtime
        hostOnly = $true
        wholeApplicationSupport = if ($Runtime -eq 'win-x64') { 'verified-via-windows-distribution-gate' } else { 'unverified' }
        sha256 = $hash
        fileCount = $fileCount
        publish = [ordered]@{
            shape = 'self-contained-folder'
            selfContained = $true
            singleFile = $false
            nativeLibrarySelfExtraction = $false
        }
        webView2 = [ordered]@{
            sdkVersion = $webView2SDKVersion
            deployment = 'evergreen'
            runtimeBundled = $false
            loaderPaths = $loaderPaths
            cleanMachineQualification = 'pending'
        }
        builtAt = [DateTimeOffset]::UtcNow.ToString('O')
    } | ConvertTo-Json -Depth 7 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory 'build-provenance.json')

    Write-Host "Windows native UI host: $hostPath"
    Write-Host "Publish shape: self-contained folder"
    Write-Host "WebView2 deployment: Evergreen Runtime (external prerequisite); SDK $webView2SDKVersion"
} finally {
    Pop-Location
}
