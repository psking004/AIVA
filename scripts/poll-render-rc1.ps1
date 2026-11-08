# scripts/poll-render-rc1.ps1
$targetCommit = "0464d08"
$healthUrl = "https://aiva-yitg.onrender.com/health"
$maxRetries = 360 # 30 minutes (5s intervals)
$attempt = 0

Write-Host ">>> Polling Render backend for commit $targetCommit (v1.0.0-rc1)..." -ForegroundColor Cyan
while ($attempt -lt $maxRetries) {
    $attempt++
    $now = (Get-Date).ToString("HH:mm:ss")
    try {
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15 -ErrorAction Stop
        $version = $res.version
        $dbLat = $res.services.database.latency
        $cacheLat = $res.services.cache.latency
        $geminiLat = if ($res.services.aiProviders.gemini.latencyMs) { $res.services.aiProviders.gemini.latencyMs } else { $res.services.gemini.latency }
        $openrouterLat = if ($res.services.aiProviders.openrouter.latencyMs) { $res.services.aiProviders.openrouter.latencyMs } else { $res.services.openrouter.latency }

        if ($attempt % 12 -eq 1 -or ($version -and $version.StartsWith($targetCommit))) {
            Write-Host "[$now] [$attempt/$maxRetries] Deployed: $version | DB: $dbLat ms | Cache: $cacheLat ms | Gemini: $geminiLat ms | OpenRouter: $openrouterLat ms"
        }
        if ($version -and $version.StartsWith($targetCommit)) {
            Write-Host "`n>>> DEPLOYMENT CONFIRMED: Commit $targetCommit (v1.0.0-rc1) is LIVE!" -ForegroundColor Green
            Write-Host "Executing Stage 1 Verification Suite..." -ForegroundColor Cyan
            & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot/audit_stage1.ps1"
            exit $LASTEXITCODE
        }
    } catch {
        Write-Host "[$now] [$attempt/$maxRetries] Warming up or error: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
}

Write-Host ">>> Polling window ended. Awaiting manual trigger in Render dashboard." -ForegroundColor Yellow
exit 1
