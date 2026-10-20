import sounddevice as sd

print("Default devices:", sd.default.device)
for i, d in enumerate(sd.query_devices()):
    name = d['name']
    in_ch = d['max_input_channels']
    out_ch = d['max_output_channels']
    api = d['hostapi']
    if 'Microphone' in name or 'Speaker' in name:
        print(f"{i}: {name} (in={in_ch}, out={out_ch}, api={api})")
