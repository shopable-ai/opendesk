[CmdletBinding()]
param([ValidateSet('win-x64','win-arm64')][string]$Runtime='win-x64')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if (!$IsWindows) { throw 'Build on Windows with Go, its native C toolchain, and .NET 8 SDK.' }
Push-Location $root
try {
    New-Item -ItemType Directory -Force dist | Out-Null
    & go build -o dist/opendesk.exe ./cmd/opendesk
    if ($LASTEXITCODE -ne 0) { throw 'OpenDesk main build failed.' }
    & ./scripts/build_windows_ui.ps1 -Runtime $Runtime
    if ($LASTEXITCODE -ne 0) { throw 'OpenDesk UI host build failed.' }
} finally { Pop-Location }
