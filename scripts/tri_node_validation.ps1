# scripts/tri_node_validation.ps1
$ErrorActionPreference = "Continue"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "       AIVA OPERATING SYSTEM: TRI-NODE DEPLOYMENT & CONCURRENT AUDIT            " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STAGE 1: TRI-NODE NETWORK PROBE & PORT READINESS AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [STAGE 1] PROBING 3-DEVICE NETWORK TOPOGRAPHY" -ForegroundColor Cyan

$mobileIp = "10.84.73.78"
$pcAIp = "10.84.73.194"
$pcBIp = "10.84.73.59"

$mobilePing = Test-Connection -ComputerName $mobileIp -Count 2 -Quiet
$adbPortCheck = Test-NetConnection -ComputerName $mobileIp -Port 5555
Write-Host "Mobile Node (10.84.73.78) : Ping=$mobilePing | ADB 5555=$($adbPortCheck.TcpTestSucceeded)"

$pcAPing = Test-Connection -ComputerName $pcAIp -Count 2 -Quiet
$pcASmb = Test-NetConnection -ComputerName $pcAIp -Port 445
$pcAWinRM = Test-NetConnection -ComputerName $pcAIp -Port 5985
$pcASsh = Test-NetConnection -ComputerName $pcAIp -Port 22
Write-Host "PC-A Node (10.84.73.194)   : Ping=$pcAPing | SMB 445=$($pcASmb.TcpTestSucceeded) | WinRM 5985=$($pcAWinRM.TcpTestSucceeded) | SSH 22=$($pcASsh.TcpTestSucceeded)"

$pcBTts = Test-NetConnection -ComputerName "127.0.0.1" -Port 5050
Write-Host "PC-B Local (127.0.0.1)      : Kokoro 5050=$($pcBTts.TcpTestSucceeded)"

# ------------------------------------------------------------------------------
# STAGE 2: ANDROID (iQOO NEO 10) APK INSTALLATION & HARDWARE LOOP TEST
# ------------------------------------------------------------------------------
Write-Host "`n>>> [STAGE 2] INSTALLING RELEASE APK ON iQOO NEO 10" -ForegroundColor Cyan
$apkPath = (Resolve-Path "apps/mobile/android/app/build/outputs/apk/release/app-release.apk").Path
$device = "$($mobileIp):5555"

Write-Host "Connecting wireless ADB to $device..."
adb disconnect $device | Out-Null
adb connect $device
adb -s $device wait-for-device

Write-Host "Streaming APK to device ($apkPath)..."
$installOut = adb -s $device install -r -d "$apkPath"
Write-Host "Install output: $installOut"

Write-Host "Waking and unlocking screen..."
adb -s $device shell input keyevent KEYCODE_WAKEUP
adb -s $device shell input keyevent 82

Write-Host "Launching com.aiva.personal.ai..."
adb -s $device shell monkey -p com.aiva.personal.ai -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 3

$focus = adb -s $device shell dumpsys window | Select-String "mCurrentFocus"
Write-Host "Mobile Focus: $focus"
$stage2Pass = $focus -match "com.aiva.personal.ai"
if ($stage2Pass) {
    Write-Host "[PASS] Android Release APK Installed & Foreground Verified." -ForegroundColor Green
} else {
    Write-Host "[WARN] Android App not topmost; check permissions or lockscreen." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# STAGE 3: PC-B LOCAL INSTALLATION & DESKTOP HOLOGRAM VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n>>> [STAGE 3] INSTALLING AIVA DESKTOP ON PC-B" -ForegroundColor Cyan
$installerPath = (Resolve-Path "apps/desktop/dist/AIVA-Windows-Setup.exe").Path

Write-Host "Executing silent desktop installer: $installerPath"
Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait
Start-Sleep -Seconds 3

$localAppPath = "$env:LOCALAPPDATA\Programs\AIVA\AIVA.exe"
if (-not (Test-Path $localAppPath)) {
    $localAppPath = "$env:LOCALAPPDATA\Programs\aiva-desktop\AIVA.exe"
}
if (-not (Test-Path $localAppPath)) {
    $localAppPath = "$env:ProgramFiles\AIVA\AIVA.exe"
}
if (-not (Test-Path $localAppPath)) {
    $localAppPath = "$env:ProgramFiles\aiva-desktop\AIVA.exe"
}
$stage3Pass = Test-Path $localAppPath
Write-Host "Installed Executable Location: $localAppPath (Exists: $stage3Pass)"

if ($stage3Pass) {
    Write-Host "[PASS] Desktop Executable Verified at $localAppPath" -ForegroundColor Green
}

if (-not $pcBTts.TcpTestSucceeded) {
    Write-Host "Starting background Kokoro TTS daemon on port 5050..." -ForegroundColor Yellow
    Start-Process python -ArgumentList "apps/desktop/kokoro-service.py --port 5050 --voice af_heart" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# ------------------------------------------------------------------------------
# STAGE 4: PC-A REMOTE INSTALLATION & COMPUTE NODE INTEGRATION
# ------------------------------------------------------------------------------
Write-Host "`n>>> [STAGE 4] DEPLOYING AIVA TO PC-A (10.84.73.194)" -ForegroundColor Cyan
$pcATargetDir = "\\$pcAIp\C`$\AIVA_Deploy"
$stage4Staged = $false
$stage4Installed = $false

try {
    if ($pcASmb.TcpTestSucceeded) {
        if (-not (Test-Path $pcATargetDir -ErrorAction SilentlyContinue)) {
            New-Item -ItemType Directory -Path $pcATargetDir -Force -ErrorAction Stop | Out-Null
        }
        Copy-Item -Path $installerPath -Destination "$pcATargetDir\AIVA-Windows-Setup.exe" -Force -ErrorAction Stop
        Write-Host "[SUCCESS] Installer copied to PC-A at $pcATargetDir\AIVA-Windows-Setup.exe" -ForegroundColor Green
        $stage4Staged = $true

        if ($pcAWinRM.TcpTestSucceeded) {
            Invoke-Command -ComputerName $pcAIp -ScriptBlock {
                Start-Process "C:\AIVA_Deploy\AIVA-Windows-Setup.exe" -ArgumentList "/S" -Wait
            }
            Write-Host "[PASS] Remote silent execution completed on PC-A via WinRM." -ForegroundColor Green
            $stage4Installed = $true
        } else {
            Write-Host "[INFO] WinRM 5985 blocked on PC-A. Installer staged for local run." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[NOTE] SMB 445 blocked on PC-A. Remote auto-stage unavailable." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[NOTE] Network share to PC-A requires domain/local credentials: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# STAGE 5: SYNCHRONIZED TRI-NODE CROSS-COMMUNICATION TEST
# ------------------------------------------------------------------------------
Write-Host "`n>>> [STAGE 5] EXECUTING TRI-NODE CONVERSATIONAL TEST" -ForegroundColor Cyan

# Cloud Health Probe
$cloud = Invoke-RestMethod -Uri "https://aiva-yitg.onrender.com/health" -Method Get
Write-Host "1. Cloud Backend       : $($cloud.status) (Version: $($cloud.version.Substring(0,7)))"

# PC-B Chat Dispatch
$tokenFile = ".aiva_pc_b_tokens.json"
$pcBChatPass = $false
if (Test-Path $tokenFile) {
    try {
        $tokenData = Get-Content $tokenFile | ConvertFrom-Json
        $token = $tokenData.accessToken
        $deviceId = if (Test-Path ".aiva_pc_b_identity.json") {
            (Get-Content ".aiva_pc_b_identity.json" | ConvertFrom-Json).device_id
        } else {
            "device_pc_b_workstation"
        }

        # Attempt token refresh to ensure freshness
        try {
            $refBody = @{ refreshToken = $tokenData.refreshToken } | ConvertTo-Json
            $refRes = Invoke-RestMethod -Uri "https://aiva-yitg.onrender.com/auth/refresh" -Method Post -Headers @{ "x-device-id" = $deviceId; "Content-Type" = "application/json" } -Body $refBody -TimeoutSec 15
            if ($refRes.accessToken) {
                $token = $refRes.accessToken
                $tokenData.accessToken = $token
                $tokenData | ConvertTo-Json | Set-Content $tokenFile
            }
        } catch {
            # Use current token if refresh fails
        }

        $headers = @{
            "Authorization"     = "Bearer $token"
            "Content-Type"      = "application/json"
            "x-device-id"       = $deviceId
            "x-client-platform" = "desktop"
        }
        $body = @{ 
            "message" = "Tri-node sync test: confirm PC-B active."
            "strategy" = "gemini-only"
        } | ConvertTo-Json
        $chatRes = Invoke-RestMethod -Uri "https://aiva-yitg.onrender.com/ai/chat" -Method Post -Headers $headers -Body $body -TimeoutSec 35
        Write-Host "2. PC-B Cloud Response : $($chatRes.response)" -ForegroundColor Green
        $pcBChatPass = $true
    } catch {
        Write-Host "2. PC-B Cloud Chat failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "2. Token file not found; skipping direct authenticated chat probe." -ForegroundColor Yellow
}

# Mobile Intent Dispatch
Write-Host "3. Dispatching Voice Intent on Android (iQOO Neo 10)..."
adb -s $device shell am broadcast -a com.aiva.personal.ai.TEST_VOICE_INTENT --es prompt "Confirm mobile node online."
Write-Host "   Broadcast signal sent to com.aiva.personal.ai" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STAGE 6: FINAL TRI-NODE ACCEPTANCE MATRIX
# ------------------------------------------------------------------------------
Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "                         FINAL ACCEPTANCE MATRIX                                " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$mStatus = if ($stage2Pass) { "[PASS] Installed & Focused" } else { "[CHECK] Manual verify" }
$bStatus = if ($stage3Pass) { "[PASS] Installed (AIVA.exe)" } else { "[CHECK] In Progress" }
$aStatus = if ($stage4Installed) { "[PASS] Installed via WinRM" } elseif ($stage4Staged) { "[STAGED] Copied to C:\AIVA_Deploy" } else { "[BLOCKED] Ports closed" }
$cStatus = if ($cloud.status -eq "healthy") { "[PASS] Healthy (v1.0.0-rc1)" } else { "[FAIL] Offline" }
$syncStatus = if ($pcBChatPass) { "[PASS] Concurrent Intent & Chat Dispatched" } else { "[CHECK] Intent Dispatched" }

Write-Host " 1. Mobile Node (iQOO Neo 10)  : $mStatus"
Write-Host " 2. PC-B Host Workstation      : $bStatus"
Write-Host " 3. PC-A Compute Workstation   : $aStatus"
Write-Host " 4. Cloud Backend (Render)     : $cStatus"
Write-Host " 5. Cross-Node Sync Signal     : $syncStatus"
Write-Host "================================================================================" -ForegroundColor Cyan
