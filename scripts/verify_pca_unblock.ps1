# scripts/verify_pca_unblock.ps1
$pcAIp = "10.84.73.194"
Write-Host ">>> Probing PC-A ($pcAIp) Remote Management & GPU Ports..." -ForegroundColor Cyan

$ping = Test-Connection -ComputerName $pcAIp -Count 2 -Quiet
$winrm = Test-NetConnection -ComputerName $pcAIp -Port 5985 -WarningAction SilentlyContinue
$ollama = Test-NetConnection -ComputerName $pcAIp -Port 11434 -WarningAction SilentlyContinue

Write-Host "PC-A Ping       : $ping"
Write-Host "WinRM (5985)    : $($winrm.TcpTestSucceeded)"
Write-Host "Ollama (11434)  : $($ollama.TcpTestSucceeded)"

if ($winrm.TcpTestSucceeded) {
    Write-Host "[SUCCESS] WinRM 5985 is OPEN on PC-A! Testing remote execution..." -ForegroundColor Green
    try {
        $osInfo = Invoke-Command -ComputerName $pcAIp -ScriptBlock { (Get-CimInstance Win32_OperatingSystem).Caption } -ErrorAction Stop
        Write-Host "Remote Host OS  : $osInfo" -ForegroundColor Green
    } catch {
        Write-Host "WinRM Connected (Auth required for command dispatch: $($_.Exception.Message))" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WAITING] WinRM 5985 is still closed on PC-A. Run Step B on PC-A." -ForegroundColor Yellow
}

if ($ollama.TcpTestSucceeded) {
    Write-Host "[SUCCESS] Ollama GPU port 11434 is reachable on PC-A!" -ForegroundColor Green
} else {
    Write-Host "[WAITING] Ollama 11434 is still closed or Ollama is not yet running on PC-A." -ForegroundColor Yellow
}

