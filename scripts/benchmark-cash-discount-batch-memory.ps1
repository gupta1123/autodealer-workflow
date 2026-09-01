param(
  [int[]]$BatchSizes = @(10, 25, 50, 100),
  [string]$CompanyName = "Solution Nyx",
  [string]$FinancialYear = "2026-27",
  [int]$LedgerLimit = 200
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node).Source
$runnerPath = Join-Path $PSScriptRoot "benchmark-current-cash-discount-flow.mjs"
$diagnosticPath = Join-Path $repoRoot ".codex-run"
$results = @()

foreach ($batchSize in $BatchSizes) {
  $tally = Get-Process -Name tally -ErrorAction Stop | Select-Object -First 1
  if (-not $tally.Responding) { throw "Tally is not responding before batch size $batchSize." }
  $baselineWorkingSet = $tally.WorkingSet64
  $baselinePrivate = $tally.PrivateMemorySize64
  $peakTallyWorkingSet = $baselineWorkingSet
  $peakTallyPrivate = $baselinePrivate
  $tallyResponding = $true
  $minimumSystemFree = [long]::MaxValue

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $nodePath
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.ArgumentList.Add($runnerPath)
  $startInfo.ArgumentList.Add($CompanyName)
  $startInfo.ArgumentList.Add($FinancialYear)
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $startInfo.Environment["KALIKA_BENCHMARK_DIAGNOSTICS"] = "1"
  $startInfo.Environment["KALIKA_BENCHMARK_DIRECTORY"] = $diagnosticPath
  $startInfo.Environment["KALIKA_CASH_DISCOUNT_UNION_BATCH_SIZE"] = [string]$batchSize
  $startInfo.Environment["KALIKA_CASH_DISCOUNT_BENCHMARK_LEDGER_LIMIT"] = [string]$LedgerLimit
  $startInfo.Environment["KALIKA_BENCHMARK_TIMEOUT_MS"] = "180000"
  $startInfo.Environment["KALIKA_BENCHMARK_QUIET"] = "1"

  Write-Host "Starting full scan with native-union batch size $batchSize..."
  $process = [System.Diagnostics.Process]::Start($startInfo)
  $peakConnectorWorkingSet = 0L
  $sampleCount = 0
  $lastSystemSample = [datetime]::MinValue
  while (-not $process.HasExited) {
    Start-Sleep -Milliseconds 250
    $sampleCount += 1
    try {
      $process.Refresh()
      $peakConnectorWorkingSet = [math]::Max($peakConnectorWorkingSet, $process.WorkingSet64)
    } catch {}
    try {
      $tally.Refresh()
      $peakTallyWorkingSet = [math]::Max($peakTallyWorkingSet, $tally.WorkingSet64)
      $peakTallyPrivate = [math]::Max($peakTallyPrivate, $tally.PrivateMemorySize64)
      if (-not $tally.Responding) { $tallyResponding = $false }
    } catch {
      $tallyResponding = $false
    }
    if (((Get-Date) - $lastSystemSample).TotalSeconds -ge 1) {
      $freeBytes = [long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
      $minimumSystemFree = [math]::Min($minimumSystemFree, $freeBytes)
      $lastSystemSample = Get-Date
    }
  }
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $resultLine = @($stdout -split "`r?`n") | Where-Object { $_ -like "BENCHMARK_RESULT *" } | Select-Object -Last 1
  if (-not $resultLine) {
    $resultLine = @($stderr -split "`r?`n") | Where-Object { $_ -like "BENCHMARK_RESULT *" } | Select-Object -Last 1
  }
  if (-not $resultLine) { throw "Batch size $batchSize produced no benchmark result. $stderr" }
  $result = ($resultLine.Substring("BENCHMARK_RESULT ".Length) | ConvertFrom-Json)
  $results += [pscustomobject]@{
    BatchSize = $batchSize
    Success = $result.event -eq "completed"
    ElapsedMs = $result.elapsedMs
    TallyCalls = $result.benchmark.tallyCallCount
    TallyReadMs = $result.benchmark.tallyReadMs
    ConnectorPeakMB = [math]::Round([math]::Max($peakConnectorWorkingSet, $result.benchmark.connector.peakRssBytes) / 1MB, 1)
    TallyBaselineMB = [math]::Round($baselineWorkingSet / 1MB, 1)
    TallyPeakMB = [math]::Round($peakTallyWorkingSet / 1MB, 1)
    TallyGrowthMB = [math]::Round(($peakTallyWorkingSet - $baselineWorkingSet) / 1MB, 1)
    TallyPrivateGrowthMB = [math]::Round(($peakTallyPrivate - $baselinePrivate) / 1MB, 1)
    MinimumSystemFreeMB = [math]::Round($minimumSystemFree / 1MB, 1)
    TallyStayedResponsive = $tallyResponding
    Ledgers = $result.ledgers
    OpenBills = $result.openBills
    Error = $result.error
  }
  $results[-1] | Format-List
  if (-not $results[-1].Success -or -not $tallyResponding) {
    Write-Warning "Stopping the batch-size sweep after an unsafe or failed run."
    break
  }
  Start-Sleep -Seconds 2
}

$results | Format-Table -AutoSize
