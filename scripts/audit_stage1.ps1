# scripts/audit_stage1.ps1
$ErrorActionPreference = "Stop"
Write-Host "`n>>> [STAGE 1] AUDITING RENDER BACKEND HEALTH" -ForegroundColor Cyan

$healthUrl = "https://aiva-yitg.onrender.com/health"
$health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15

$dbLatency = $health.services.database.latency
$cacheLatency = $health.services.cache.latency
$geminiLatency = $health.services.aiProviders.gemini.latencyMs
$openRouterLatency = $health.services.aiProviders.openrouter.latencyMs

Write-Host "Cloud Status        : $($health.status)"
Write-Host "Deployed Version    : $($health.version)"
Write-Host "Database Latency    : $dbLatency ms (Target: < 800 ms)"
Write-Host "Cache Latency       : $cacheLatency ms (Target: < 300 ms)"
Write-Host "Gemini Latency      : $geminiLatency ms (Target: < 350 ms)"
Write-Host "OpenRouter Latency  : $openRouterLatency ms (Target: < 300 ms)"

if ($health.status -ne "healthy" -or -not $health.version.StartsWith("0464d08")) {
    Write-Host "[FAIL] Cloud health or commit version mismatch." -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Cloud infrastructure healthy and running v1.0.0-rc1." -ForegroundColor Green

