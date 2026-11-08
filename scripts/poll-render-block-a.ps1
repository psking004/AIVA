# scripts/poll-render-block-a.ps1
$targetCommit = "277773b"
$targetModel = "gemini-flash-lite-latest"
$healthUrl = "https://aiva-yitg.onrender.com/health"
$maxRetries = 60 # 5 minutes (5-second intervals)
$attempt = 0

Write-Host ">>> Polling Render backend for commit $targetCommit..." -ForegroundColor Cyan
while ($attempt -lt $maxRetries) {
    $attempt++
    $now = (Get-Date).ToString("HH:mm:ss")
    try {
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15 -ErrorAction Stop
        $version = $res.version
        $model = if ($res.services.aiProviders.gemini.model) { $res.services.aiProviders.gemini.model } else { $res.services.gemini.model }
        $geminiLat = if ($res.services.aiProviders.gemini.latencyMs) { $res.services.aiProviders.gemini.latencyMs } else { $res.services.gemini.latency }
        $openrouterLat = if ($res.services.aiProviders.openrouter.latencyMs) { $res.services.aiProviders.openrouter.latencyMs } else { $res.services.openrouter.latency }

        Write-Host "[$now] [$attempt/$maxRetries] Deployed: $version | Gemini: $model ($geminiLat ms) | OpenRouter: ($openrouterLat ms)"
        if ($version -and $version.StartsWith($targetCommit) -and $model -eq $targetModel) {
            Write-Host ">>> DEPLOYMENT CONFIRMED: Commit $targetCommit with $targetModel is LIVE." -ForegroundColor Green
            Write-Host "Full Payload: $($res | ConvertTo-Json -Depth 5)"
            exit 0
        }
    } catch {
        Write-Host "[$now] [$attempt/$maxRetries] Request warming up / error: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
}

Write-Host ">>> TIMEOUT: Deployment not observed within window." -ForegroundColor Yellow
exit 1
