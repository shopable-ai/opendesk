# Build or cross-publish the Windows native UI sidecar. Run from any working directory:
# pwsh -File scripts/build_windows_ui.ps1
# No WebView2 installation is needed for FloatingWindow/notification rendering.
[CmdletBinding()]
param(
    [ValidateSet('win-x64','win-arm64')][string]$Runtime = 'win-x64',
    [string]$OutputDirectory = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path $root 'dist/ui-host' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$buildRoot = Join-Path $root ('.runtime/build/windows-ui/' + $Runtime)
$stage = Join-Path $buildRoot 'publish'
$artifacts = Join-Path $buildRoot 'artifacts'
New-Item -ItemType Directory -Force $stage | Out-Null
Push-Location $root
try {
    & dotnet publish pkg/customui/winhost/OpenDesk.UIHost.csproj -c Release -r $Runtime --self-contained true -o $stage --artifacts-path $artifacts '-p:ContinuousIntegrationBuild=true'
    if ($LASTEXITCODE -ne 0) { throw "Windows native UI publish failed ($LASTEXITCODE)" }
    New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
    # Keep the self-contained publish closure, including WebView2Loader.dll.
    Copy-Item -Path (Join-Path $stage '*') -Destination $OutputDirectory -Recurse -Force
    $sha = (& git rev-parse HEAD).Trim()
    $hash = (Get-FileHash (Join-Path $OutputDirectory 'opendesk-ui-host.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
    @{ schemaVersion=1; sourceCommit=$sha; sourceDirty=[bool]((& git status --porcelain).Length);  protocolVersion='1.8.0'; runtime=$Runtime; sha256=$hash; builtAt=[DateTimeOffset]::UtcNow.ToString('O') } |
        ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $OutputDirectory 'build-provenance.json')
    Write-Host "Windows native UI host: $(Join-Path $OutputDirectory 'opendesk-ui-host.exe')"
} finally { Pop-Location }
