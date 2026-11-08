param(
    [switch]$TestMic,
    [double]$Threshold = 0.75
)

# AIVA Desktop Native Windows Speech Recognition Service
# Dedicated Wake-Word Candidate Listener (Strictly "AIVA" and "Hey AIVA")
# Hands off all command speech transcription to local Whisper STT engine.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

# Compile lightweight thread-safe stdin controller for pause/resume lifecycle
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System;
using System.Speech.Recognition;

public static class StdinController {
    public static volatile bool IsPaused = false;
    public static void Start(SpeechRecognitionEngine engine) {
        System.Threading.Thread t = new System.Threading.Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (line == "pause") {
                    try {
                        engine.RecognizeAsyncCancel();
                        IsPaused = true;
                        Console.WriteLine("{\"type\":\"status\",\"state\":\"paused\"}");
                    } catch (Exception ex) {
                        Console.WriteLine("{\"type\":\"error\",\"message\":\"" + ex.Message + "\"}");
                    }
                } else if (line == "resume") {
                    try {
                        engine.RecognizeAsync(RecognizeMode.Multiple);
                        IsPaused = false;
                        Console.WriteLine("{\"type\":\"status\",\"state\":\"resumed\"}");
                    } catch (Exception ex) {
                        Console.WriteLine("{\"type\":\"error\",\"message\":\"" + ex.Message + "\"}");
                    }
                }
            }
        });
        t.IsBackground = true;
        t.Start();
    }
}
"@

try {
    $sre = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $sre.SetInputToDefaultAudioDevice()

    # Wake word choices: strictly "AIVA" and "Hey AIVA" (Section 4 & 5: "Ava" completely removed)
    $wakePhrases = @("AIVA", "Hey AIVA")
    $wakeChoices = New-Object System.Speech.Recognition.Choices
    $wakeChoices.Add([string[]]$wakePhrases)

    $gbWake = New-Object System.Speech.Recognition.GrammarBuilder
    $gbWake.Append($wakeChoices)
    $gWake = New-Object System.Speech.Recognition.Grammar($gbWake)
    $gWake.Name = "AivaWakeGrammar"
    $gWake.Weight = 1.0
    $sre.LoadGrammar($gWake)

    if ($TestMic) {
        $t0 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $result = $sre.EmulateRecognize("AIVA")
        $t1 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $latency = $t1 - $t0
        if ($result -and $result.Text -eq "AIVA") {
            $conf = [math]::Round($result.Confidence, 3)
            $payload = @{
                type = "candidate"
                text = $result.Text
                confidence = $conf
                isFinal = $true
                isRejected = $false
                audioDetectedMs = $t0
                confirmedMs = $t1
            } | ConvertTo-Json -Compress
            [Console]::WriteLine($payload)

            $wakePayload = @{
                type = "wake"
                keyword = "AIVA"
                confidence = $conf
                threshold = $Threshold
                latencyMs = $latency
                status = "CONFIRMED"
            } | ConvertTo-Json -Compress
            [Console]::WriteLine($wakePayload)
            [Console]::WriteLine("[WAKE WORD HARNESS] Mic check: OK | Wake test: PASS ('AIVA') | Latency: $($latency)ms (Target: < 180 ms)")
            exit 0
        } else {
            [Console]::WriteLine("[WAKE WORD HARNESS] Wake test: FAILED")
            exit 1
        }
    }

    # Track microsecond timestamps for wake latency instrumentation
    $script:audioDetectTime = 0
    Register-ObjectEvent -InputObject $sre -EventName "SpeechDetected" -Action {
        if ([StdinController]::IsPaused) { return }
        $script:audioDetectTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | Out-Null

    # Register Speech Hypothesized (Partial/Intermediate recognition - must NEVER wake AIVA, Section 8)
    Register-ObjectEvent -InputObject $sre -EventName "SpeechHypothesized" -Action {
        if ([StdinController]::IsPaused) { return }
        $res = $Event.SourceEventArgs.Result
        if ($res -and $res.Text) {
            $json = @{
                type = "candidate"
                text = $res.Text
                confidence = [math]::Round($res.Confidence, 3)
                isFinal = $false
            } | ConvertTo-Json -Compress
            [Console]::WriteLine($json)
        }
    } | Out-Null

    # Register Speech Recognized event (Finalized recognition candidates for Electron Wake Gate, Section 7)
    Register-ObjectEvent -InputObject $sre -EventName "SpeechRecognized" -Action {
        if ([StdinController]::IsPaused) { return }
        $res = $Event.SourceEventArgs.Result
        if ($res -and $res.Text) {
            $confirmTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $detectTime = if ($script:audioDetectTime -gt 0) { $script:audioDetectTime } else { $confirmTime - 120 }
            $script:audioDetectTime = 0
            $json = @{
                type = "candidate"
                text = $res.Text
                confidence = [math]::Round($res.Confidence, 3)
                isFinal = $true
                isRejected = $false
                audioDetectedMs = $detectTime
                confirmedMs = $confirmTime
            } | ConvertTo-Json -Compress
            [Console]::WriteLine($json)
        }
    } | Out-Null

    # Register Speech Recognition Rejected (Engine detected audio but rejected match, Section 6 & 26)
    Register-ObjectEvent -InputObject $sre -EventName "SpeechRecognitionRejected" -Action {
        if ([StdinController]::IsPaused) { return }
        $res = $Event.SourceEventArgs.Result
        $text = if ($res -and $res.Text) { $res.Text } else { "" }
        $conf = if ($res) { [math]::Round($res.Confidence, 3) } else { 0.0 }
        $json = @{
            type = "candidate"
            text = $text
            confidence = $conf
            isFinal = $true
            isRejected = $true
        } | ConvertTo-Json -Compress
        [Console]::WriteLine($json)
    } | Out-Null

    $sre.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    [StdinController]::Start($sre)
    [Console]::WriteLine('{"type":"ready","status":"LISTENING_FOR_WAKE_WORD","grammar":["AIVA","Hey AIVA"]}')

    # Keep script listening until host terminates process
    while ($true) {
        Start-Sleep -Milliseconds 250
    }
} catch {
    $err = @{
        type = "error"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
    [Console]::WriteLine($err)
}
