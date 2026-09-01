param(
  [int]$ConnectorPid = 0,
  [string]$OutputPath = "",
  [int]$IntervalMilliseconds = 500
)

$ErrorActionPreference = "Stop"
$diagnosticRoot = Join-Path $env:USERPROFILE ".autodealer-tally-bridge\diagnostics"
New-Item -ItemType Directory -Path $diagnosticRoot -Force | Out-Null
if (-not $OutputPath) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $diagnosticRoot "process-health-$timestamp.csv"
}

"timestamp,kind,pid,name,responding,cpu_seconds,working_set_bytes,private_bytes,system_free_bytes" |
  Set-Content -LiteralPath $OutputPath -Encoding utf8

Write-Host "Recording Tally and connector health to $OutputPath"
Write-Host "Run one benchmark action, then press Ctrl+C here."

$systemFreeBytes = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
$lastSystemSample = Get-Date
while ($true) {
  $timestamp = (Get-Date).ToUniversalTime().ToString("o")
  if (((Get-Date) - $lastSystemSample).TotalSeconds -ge 5) {
    $systemFreeBytes = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
    $lastSystemSample = Get-Date
  }
  $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -match "^(tally|tallyprime)$" -or ($ConnectorPid -gt 0 -and $_.Id -eq $ConnectorPid)
  })
  foreach ($process in $processes) {
    $kind = if ($process.ProcessName -match "^(tally|tallyprime)$") { "tally" } else { "connector" }
    $line = @(
      $timestamp,
      $kind,
      $process.Id,
      $process.ProcessName,
      $process.Responding,
      [math]::Round($process.CPU, 3),
      $process.WorkingSet64,
      $process.PrivateMemorySize64,
      $systemFreeBytes
    ) -join ","
    Add-Content -LiteralPath $OutputPath -Value $line -Encoding utf8
  }
  Start-Sleep -Milliseconds ([math]::Max(250, $IntervalMilliseconds))
}
