param(
  [string]$OpenDeskPath = ".\dist\opendesk.exe",
  [string]$FixturePath = ".\.runtime\tests\windows-compat\window-fixture.exe"
)

$ErrorActionPreference = "Stop"
$evidenceDir = ".runtime/tests/windows-compat"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

if (-not (Test-Path -LiteralPath $OpenDeskPath)) {
  throw "OpenDesk runtime was not found at $OpenDeskPath"
}
if (-not (Test-Path -LiteralPath $FixturePath)) {
  throw "Windows fixture was not found at $FixturePath"
}

$environment = [ordered]@{
  schemaVersion = 1
  osVersion = [Environment]::OSVersion.VersionString
  architecture = $env:PROCESSOR_ARCHITECTURE
  runnerOS = $env:RUNNER_OS
  runnerName = $env:RUNNER_NAME
  githubSHA = $env:GITHUB_SHA
  githubRunId = $env:GITHUB_RUN_ID
  recordedAt = [DateTime]::UtcNow.ToString("o")
}
$environment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$evidenceDir/environment.json" -Encoding UTF8

function Start-WindowFixture {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [int]$CloseDelayMS = 0,
    [Parameter(Mandatory = $true)][string]$LogStem
  )
  $stdout = Join-Path $evidenceDir "$LogStem.stdout.log"
  $stderr = Join-Path $evidenceDir "$LogStem.stderr.log"
  return Start-Process -FilePath $FixturePath `
    -ArgumentList @("--title", $Title, "--close-delay-ms", "$CloseDelayMS") `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Stop-WindowFixture {
  param([System.Diagnostics.Process]$Process)
  if ($null -eq $Process) { return }
  try {
    $Process.Refresh()
    if (-not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $Process.Id -Timeout 5 -ErrorAction SilentlyContinue
    }
  } catch {
    # Cleanup must not hide the primary test result.
  }
}

function Invoke-OpenDeskContract {
  param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string]$LogName
  )
  $logPath = Join-Path $evidenceDir $LogName
  & $OpenDeskPath -script $Script -console-mode script *>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "OpenDesk contract $Script failed with exit code $exitCode"
  }
}

$runSuffix = if ([string]::IsNullOrWhiteSpace($env:GITHUB_RUN_ID)) { [Guid]::NewGuid().ToString("N") } else { $env:GITHUB_RUN_ID }
$normalTitle = "OpenDesk-Window-Fixture-$runSuffix"
$hungTitle = "OpenDesk-Hung-Window-Fixture-$runSuffix"
$ambiguousTitle = "OpenDesk-Ambiguous-Window-Fixture-$runSuffix"

$normal = $null
$hung = $null
$ambiguousA = $null
$ambiguousB = $null
$status = "failed"
$failure = $null

try {
  $normal = Start-WindowFixture -Title $normalTitle -CloseDelayMS 0 -LogStem "fixture-normal"
  $hung = Start-WindowFixture -Title $hungTitle -CloseDelayMS 10000 -LogStem "fixture-hung"
  Start-Sleep -Milliseconds 500

  $env:OPENDESK_WINDOW_FIXTURE_TITLE = $normalTitle
  $env:OPENDESK_WINDOW_FIXTURE_PID = [string]$normal.Id
  $env:OPENDESK_WINDOW_HUNG_TITLE = $hungTitle
  $env:OPENDESK_WINDOW_HUNG_PID = [string]$hung.Id
  Invoke-OpenDeskContract -Script "tests/runtime-api/windows-window-live.js" -LogName "window-runtime-live.log"

  Stop-WindowFixture -Process $normal
  $normal = $null
  Stop-WindowFixture -Process $hung
  $hung = $null

  $ambiguousA = Start-WindowFixture -Title $ambiguousTitle -CloseDelayMS 0 -LogStem "fixture-ambiguous-a"
  $ambiguousB = Start-WindowFixture -Title $ambiguousTitle -CloseDelayMS 0 -LogStem "fixture-ambiguous-b"
  Start-Sleep -Milliseconds 500
  $env:OPENDESK_WINDOW_AMBIGUOUS_TITLE = $ambiguousTitle
  Invoke-OpenDeskContract -Script "tests/runtime-api/windows-window-ambiguity.js" -LogName "window-runtime-ambiguity.log"

  $status = "passed"
} catch {
  $failure = $_.Exception.Message
  throw
} finally {
  Stop-WindowFixture -Process $normal
  Stop-WindowFixture -Process $hung
  Stop-WindowFixture -Process $ambiguousA
  Stop-WindowFixture -Process $ambiguousB

  $summary = [ordered]@{
    schemaVersion = 1
    suite = "windows-window-manager-hosted-live"
    status = $status
    normalTitle = $normalTitle
    hungTitle = $hungTitle
    ambiguousTitle = $ambiguousTitle
    failure = $failure
    environment = $environment
    recordedAt = [DateTime]::UtcNow.ToString("o")
  }
  $summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$evidenceDir/window-manager-summary.json" -Encoding UTF8
}

Write-Host "WINDOW_MANAGER_HOSTED_LIVE_PASS"
