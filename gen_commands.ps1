Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Rate = -1 # Natural speaking rate

$commands = @{
    "cmd1.wav" = "What is the capital of India?"
    "cmd2.wav" = "What time is it?"
    "cmd3.wav" = "Who are you?"
    "cmd4.wav" = "Show my tasks."
    "cmd5.wav" = "Create a task called test voice command."
    "cmd6.wav" = "What do you remember about me?"
}

foreach ($item in $commands.GetEnumerator()) {
    $speaker.SetOutputToWaveFile($item.Key)
    $speaker.Speak($item.Value)
    Write-Host "Generated $($item.Key) for: $($item.Value)"
}

$speaker.Dispose()
