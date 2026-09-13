$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot '..\docker-compose.chatsalles.yml'
$composeFile = [System.IO.Path]::GetFullPath($composeFile)

function Invoke-Compose {
  param([string[]]$Arguments)
  & docker compose -f $composeFile @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed: $($Arguments -join ' ')"
  }
}

function Assert-Health {
  param([string]$Url)
  $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
  if ($response.StatusCode -ne 200) {
    throw "Health check failed: $Url returned HTTP $($response.StatusCode)"
  }
}

function Assert-Available {
  param([string]$Url)
  try {
    Assert-Health $Url
  }
  catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429) {
      Write-Output "Endpoint reachable but rate limited: $Url"
      return
    }
    throw
  }
}

function Get-ServiceContainerId {
  param([string]$Service)
  $id = (& docker compose -f $composeFile ps -aq $Service).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($id)) {
    throw "Container not found for service: $Service"
  }
  return $id
}

Write-Output 'Checking initial API availability...'
Assert-Available 'http://localhost:3001/health'
Assert-Available 'http://localhost:3002/health'

Write-Output 'Stopping Redis and checking API fallback...'
Invoke-Compose @('stop', 'chatsalles-redis')
try {
  Start-Sleep -Seconds 3
  Assert-Available 'http://localhost:3001/health'
  Assert-Available 'http://localhost:3002/health'
}
finally {
  Invoke-Compose @('start', 'chatsalles-redis')
}

Write-Output 'Waiting for Redis health...'
for ($attempt = 1; $attempt -le 20; $attempt += 1) {
  $redisContainer = Get-ServiceContainerId 'chatsalles-redis'
  $status = & docker inspect --format '{{.State.Health.Status}}' $redisContainer
  if ($LASTEXITCODE -eq 0 -and $status -eq 'healthy') {
    break
  }
  if ($attempt -eq 20) {
    throw 'Redis did not become healthy after restart'
  }
  Start-Sleep -Seconds 2
}

Write-Output 'Restarting worker and checking service state...'
Invoke-Compose @('restart', 'chatsalles-worker')
$workerContainer = Get-ServiceContainerId 'chatsalles-worker'
$workerState = & docker inspect --format '{{.State.Status}}' $workerContainer
if ($LASTEXITCODE -ne 0 -or $workerState -ne 'running') {
  throw "Worker is not running after restart: $workerState"
}

Write-Output 'Stopping API 1 and verifying API 2 remains available...'
Invoke-Compose @('stop', 'chatsalles-api')
try {
  Start-Sleep -Seconds 3
  $apiOneContainer = Get-ServiceContainerId 'chatsalles-api'
  $apiOneState = & docker inspect --format '{{.State.Status}}' $apiOneContainer
  if ($LASTEXITCODE -ne 0 -or $apiOneState -ne 'exited') {
    throw "API 1 container did not stop: $apiOneState"
  }
  Assert-Available 'http://localhost:3002/health'
  Write-Output 'API 1 container is stopped and API 2 remains available.'
}
finally {
  Invoke-Compose @('start', 'chatsalles-api')
}

Start-Sleep -Seconds 3
Assert-Available 'http://localhost:3001/health'
Assert-Available 'http://localhost:3002/health'
Write-Output 'Failover smoke test passed.'
