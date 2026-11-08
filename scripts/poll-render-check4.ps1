# scripts/poll-render-check4.ps1
$targetCommit = "fb4db41"
$healthUrl = "https://aiva-yitg.onrender.com/health"
$maxRetries = 60 # 5 minutes (5s intervals)
$attempt = 0

Write-Host ">>> Polling Render backend for commit $targetCommit..." -ForegroundColor Cyan
while ($attempt -lt $maxRetries) {
    $attempt++
    $now = (Get-Date).ToString("HH:mm:ss")
    try {
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15 -ErrorAction Stop
        $version = $res.version
        $model = if ($res.services.aiProviders.gemini.model) { $res.services.aiProviders.gemini.model } else { $res.services.gemini.model }

        Write-Host "[$now] [$attempt/$maxRetries] Version: $version | Model: $model"
        if ($version -and $version.StartsWith($targetCommit)) {
            Write-Host "`n========================================================" -ForegroundColor Green
            Write-Host ">>> DEPLOYMENT CONFIRMED: $targetCommit is live!" -ForegroundColor Green
            Write-Host "Version: $version" -ForegroundColor Green
            Write-Host "Gemini Model: $model" -ForegroundColor Green
            Write-Host "========================================================`n" -ForegroundColor Green
            exit 0
        }
    } catch {
        Write-Host "[$now] [$attempt/$maxRetries] Waiting for container spinup ($($_.Exception.Message))..." -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 5
}

Write-Host ">>> TIMEOUT: Check 4 polling loop finished without observing $targetCommit." -ForegroundColor Red
exit 1
