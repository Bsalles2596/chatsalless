param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) {
  throw 'Restore is destructive. Re-run with -ConfirmRestore.'
}

$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
  throw "Backup file not found: $BackupPath"
}

$composeFile = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docker-compose.chatsalles.yml'))
$containerPath = '/tmp/chatsalles-restore.dump'
$containerId = (& docker compose -f $composeFile ps -q chatsalles-postgres).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
  throw 'PostgreSQL container not found'
}
& docker cp $BackupPath "${containerId}:$containerPath"
if ($LASTEXITCODE -ne 0) {
  throw 'PostgreSQL restore copy failed'
}
& docker compose -f $composeFile exec -T chatsalles-postgres sh -c "pg_restore -U `"$`$POSTGRES_USER`" -d `"$`$POSTGRES_DB`" --clean --if-exists --exit-on-error $containerPath"
$restoreExitCode = $LASTEXITCODE
& docker compose -f $composeFile exec -T chatsalles-postgres rm -f $containerPath
if ($restoreExitCode -ne 0) {
  throw 'PostgreSQL restore failed'
}

Write-Output "Restore completed from: $BackupPath"
