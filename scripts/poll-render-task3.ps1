# scripts/poll-render-task3.ps1
$targetCommit = "fb4db41"
$targetModel = "gemini-flash-lite-latest"
$healthUrl = "https://aiva-yitg.onrender.com/health"
$maxAttempts = 90
$attempt = 0

Write-Host ">>> Polling Render service aiva-yitg for commit $targetCommit..." -ForegroundColor Cyan
while ($attempt -lt $maxAttempts) {
    $attempt++
    $now = (Get-Date).ToString("HH:mm:ss")
    try {
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
        $ver = $res.version
        $model = if ($res.services.aiProviders.gemini.model) { $res.services.aiProviders.gemini.model } else { $res.services.gemini.model }

        Write-Host "[$now] [$attempt/$maxAttempts] Version: $ver | Model: $model"
        if ($ver -and $ver.StartsWith($targetCommit) -and $model -eq $targetModel) {
            Write-Host "`n========================================================" -ForegroundColor Green
            Write-Host ">>> CONTAINER LIVE: Commit $targetCommit verified active." -ForegroundColor Green
            Write-Host "Version: $ver" -ForegroundColor Green
            Write-Host "Model: $model" -ForegroundColor Green
            Write-Host "========================================================`n" -ForegroundColor Green
            exit 0
        }
    } catch {
        Write-Host "[$now] [$attempt/$maxAttempts] Service spinning up or deploying... ($($_.Exception.Message))" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 5
}

Write-Host ">>> TIMEOUT: Polling loop finished without observing $targetCommit." -ForegroundColor Red
exit 1
