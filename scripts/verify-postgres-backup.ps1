param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
  throw "Backup file not found: $BackupPath"
}

$composeFile = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docker-compose.chatsalles.yml'))
$containerPath = '/tmp/chatsalles-verify.dump'
& docker cp $BackupPath "chatsalles-chatsalles-postgres-1:$containerPath"
if ($LASTEXITCODE -ne 0) {
  throw 'Backup copy failed'
}

try {
  $entries = & docker compose -f $composeFile exec -T chatsalles-postgres pg_restore --list $containerPath
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($entries -join "`n"))) {
    throw 'Backup archive is not a valid PostgreSQL custom dump'
  }
  Write-Output "Backup is valid: $BackupPath"
  Write-Output ("Archive entries: " + @($entries).Count)
}
finally {
  & docker compose -f $composeFile exec -T chatsalles-postgres rm -f $containerPath | Out-Null
}
