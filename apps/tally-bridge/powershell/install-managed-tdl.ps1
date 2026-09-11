param([Parameter(Mandatory = $true)][string]$AgentResourceDirectory)

$ErrorActionPreference = 'Stop'
$managedFiles = @(
  'kalika-native-debit-note-export.tdl',
  'kalika-purchase-document-attachment.tdl',
  'kalika-agent-sync-reports.tdl'
)
$candidateDirectories = @(
  (Join-Path $env:ProgramFiles 'TallyPrime'),
  (Join-Path ${env:ProgramFiles(x86)} 'TallyPrime')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }

if (-not $candidateDirectories.Count) { exit 0 }
$tallyDirectory = $candidateDirectories[0]
$iniPath = Join-Path $tallyDirectory 'tally.ini'
$sourceDirectory = Join-Path $AgentResourceDirectory 'tdl'
foreach ($fileName in $managedFiles) {
  $source = Join-Path $sourceDirectory $fileName
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $tallyDirectory $fileName) -Force
  }
}

if (-not (Test-Path -LiteralPath $iniPath -PathType Leaf)) { exit 0 }
$backup = "$iniPath.kalika-backup-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -LiteralPath $iniPath -Destination $backup -Force
$lines = [System.Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $iniPath | ForEach-Object { [void]$lines.Add($_) }
$userTdlIndex = -1
for ($index = 0; $index -lt $lines.Count; $index++) {
  if ($lines[$index].Trim() -match '^User TDL\s*=') { $userTdlIndex = $index; break }
}
if ($userTdlIndex -ge 0) { $lines[$userTdlIndex] = 'User TDL=Yes' } else { $lines.Add('User TDL=Yes') }
foreach ($fileName in $managedFiles) {
  $target = Join-Path $tallyDirectory $fileName
  $line = "TDL=$target"
  $found = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index].Trim() -match '^TDL\s*=' -and $lines[$index].IndexOf($fileName, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $lines[$index] = $line; $found = $true
    }
  }
  if (-not $found) { $lines.Add($line) }
}
[IO.File]::WriteAllLines($iniPath, $lines, [Text.UTF8Encoding]::new($false))
