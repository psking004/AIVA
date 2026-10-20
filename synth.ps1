Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SetOutputToWaveFile('test_speech.wav')
$speaker.Speak('What is the capital of India?')
$speaker.Dispose()
Write-Host "Audio synthesized successfully."
