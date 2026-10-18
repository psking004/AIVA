# AIVA Desktop Native Windows Speech Recognition Service
# Dedicated Wake-Word Listener ("AIVA", "Hey AIVA", "Ava", etc.)
# Hands off all command speech transcription to local Whisper STT engine.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

try {
    $sre = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $sre.SetInputToDefaultAudioDevice()

    # Wake word choices
    $wakePhrases = @("AIVA", "Hey AIVA", "Okay AIVA", "OK AIVA", "Hi AIVA", "Hello AIVA", "Ava", "Hey Ava", "Okay Ava")
    $wakeChoices = New-Object System.Speech.Recognition.Choices
    $wakeChoices.Add([string[]]$wakePhrases)

    $gbWake = New-Object System.Speech.Recognition.GrammarBuilder
    $gbWake.Append($wakeChoices)
    $gWake = New-Object System.Speech.Recognition.Grammar($gbWake)
    $gWake.Name = "AivaWakeGrammar"
    $gWake.Weight = 1.0
    $sre.LoadGrammar($gWake)

    # Track microsecond timestamps for wake latency instrumentation
    $script:audioDetectTime = 0
    Register-ObjectEvent -InputObject $sre -EventName "SpeechDetected" -Action {
        $script:audioDetectTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | Out-Null

    # Register Speech Recognized event for wake word
    Register-ObjectEvent -InputObject $sre -EventName "SpeechRecognized" -Action {
        $res = $Event.SourceEventArgs.Result
        if ($res -and $res.Text -and $res.Confidence -ge 0.12) {
            $confirmTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $detectTime = if ($script:audioDetectTime -gt 0) { $script:audioDetectTime } else { $confirmTime - 120 }
            $script:audioDetectTime = 0
            $json = @{
                type = "wake"
                text = $res.Text
                confidence = [math]::Round($res.Confidence, 2)
                isFinal = $true
                audioDetectedMs = $detectTime
                confirmedMs = $confirmTime
            } | ConvertTo-Json -Compress
            [Console]::WriteLine($json)
        }
    } | Out-Null

    $sre.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    [Console]::WriteLine('{"type":"ready","status":"LISTENING_FOR_WAKE_WORD"}')

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
