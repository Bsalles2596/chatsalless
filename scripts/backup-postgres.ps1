param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
$composeFile = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docker-compose.chatsalles.yml'))
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $OutputDirectory "chatsalles-$timestamp.dump"
$containerPath = "/tmp/chatsalles-$timestamp.dump"
& docker compose -f $composeFile exec -T chatsalles-postgres sh -c "pg_dump -U postgres -d chatsalles -Fc > $containerPath"
if ($LASTEXITCODE -ne 0) {
  throw 'PostgreSQL backup failed'
}
& docker cp "chatsalles-chatsalles-postgres-1:$containerPath" $backupPath
$copyExitCode = $LASTEXITCODE
& docker compose -f $composeFile exec -T chatsalles-postgres rm -f $containerPath
if ($copyExitCode -ne 0) {
  Remove-Item -Force $backupPath -ErrorAction SilentlyContinue
  throw 'PostgreSQL backup copy failed'
}

Write-Output "Backup created: $backupPath"
