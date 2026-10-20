"""
AIVA Desktop Local Whisper Speech-to-Text Service
Provides local, low-latency, private STT using faster-whisper.
Runs as a background daemon process spawned by Electron main.js.
Communicates via JSON Lines over stdin / stdout.
"""

import sys
import os
import time
import json
import threading
import collections
import wave
import numpy as np

# Ensure stdout and stderr use UTF-8 and auto-flush
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Suppress Hugging Face symlink warning on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Emit structured JSON messages to Electron main.js
def emit(data):
    try:
        sys.stdout.write(json.dumps(data) + '\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"[AIVA STT Error] Failed to emit: {e}\n")
        sys.stderr.flush()

def log(msg):
    sys.stderr.write(f"{msg}\n")
    sys.stderr.flush()

log("[AIVA STT] Initializing local Whisper STT engine...")

try:
    import ctranslate2
    from faster_whisper import WhisperModel
    import sounddevice as sd
except ImportError as e:
    emit({"type": "error", "message": f"Missing dependency: {str(e)}"})
    sys.exit(1)

# Hardware selection: RTX 3050 CUDA if available, CPU fallback
cuda_count = ctranslate2.get_cuda_device_count()
device = "cuda" if cuda_count > 0 else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
model_name = "base.en"

log(f"[AIVA WHISPER] model: {model_name}")
log(f"[AIVA WHISPER] device: {device}")
log(f"[AIVA WHISPER] compute: {compute_type}")

t_start = time.time()
try:
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    load_time = round(time.time() - t_start, 2)
    log(f"[AIVA STT] Whisper '{model_name}' loaded successfully in {load_time}s on {device.upper()}")
except Exception as e:
    log(f"[AIVA STT] Failed to load on {device}, falling back to CPU int8: {e}")
    device = "cpu"
    compute_type = "int8"
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    log(f"[AIVA STT] Whisper '{model_name}' loaded successfully on CPU fallback")

# Warmup Whisper engine to eliminate first-run cold latency (Requirement 5)
try:
    log("[AIVA STT] Warming up Whisper engine with dummy audio...")
    warmup_audio = np.zeros(8000, dtype=np.float32)
    list(model.transcribe(warmup_audio, beam_size=1, language="en", vad_filter=False)[0])
    log("[AIVA STT] Whisper engine warmup completed.")
except Exception as w_err:
    log(f"[AIVA STT] Warmup notice: {w_err}")

# PART 2 — ENUMERATE AND TEST ALL AVAILABLE INPUT DEVICES
log("=== ENUMERATING AVAILABLE AUDIO INPUT DEVICES ===")
usable_devices = []
try:
    all_devices = sd.query_devices()
    all_hostapis = sd.query_hostapis()
    for idx, d in enumerate(all_devices):
        if d.get('max_input_channels', 0) > 0:
            h_idx = d.get('hostapi', 0)
            h_name = all_hostapis[h_idx]['name'] if h_idx < len(all_hostapis) else 'Unknown'
            usable_devices.append((idx, d, h_name))
            log(f"Device {idx}: {d['name']} | host API: {h_name} | max input channels: {d['max_input_channels']} | default sample rate: {d.get('default_samplerate', 0)}")
except Exception as dev_err:
    log(f"[AIVA STT] Device enumeration error: {dev_err}")

# Select optimal input device (WASAPI preferred if available, fallback to default MME/DirectSound)
selected_device_idx = None
selected_device_name = "Default Microphone"
selected_host_api = "MME"
use_wasapi_48k = False

try:
    # Look for WASAPI Intel Smart Sound / primary mic array
    wasapi_candidates = [
        (idx, d, h) for idx, d, h in usable_devices
        if 'WASAPI' in h and ('microphone' in d['name'].lower() or 'array' in d['name'].lower())
    ]
    if wasapi_candidates:
        cand_idx, cand_dev, cand_host = wasapi_candidates[0]
        # Verify 48kHz capture support
        try:
            sd.check_input_settings(device=cand_idx, channels=1, samplerate=48000, dtype='float32')
            selected_device_idx = cand_idx
            selected_device_name = cand_dev['name']
            selected_host_api = cand_host
            use_wasapi_48k = True
            log(f"[AIVA STT] Selected high-fidelity WASAPI device {selected_device_idx}: {selected_device_name} (48kHz -> 16kHz decimation)")
        except Exception as wasapi_chk_err:
            log(f"[AIVA STT] WASAPI 48kHz check failed ({wasapi_chk_err}), falling back to default device")

    if selected_device_idx is None:
        default_in = sd.query_devices(kind='input')
        selected_device_idx = default_in['index'] if 'index' in default_in else None
        selected_device_name = default_in.get('name', 'Default Microphone')
        h_idx = default_in.get('hostapi', 0)
        selected_host_api = all_hostapis[h_idx]['name'] if h_idx < len(all_hostapis) else 'Default'
        use_wasapi_48k = False
        log(f"[AIVA STT] Selected default input device {selected_device_idx}: {selected_device_name} ({selected_host_api} at 16kHz)")
except Exception as select_err:
    log(f"[AIVA STT] Error selecting device, using defaults: {select_err}")
    selected_device_idx = None
    selected_device_name = "Default Microphone"
    selected_host_api = "Default"
    use_wasapi_48k = False

# Audio Pipeline Configuration
SAMPLE_RATE = 16000
HARDWARE_RATE = 48000 if use_wasapi_48k else 16000
BLOCK_SIZE = 3072 if use_wasapi_48k else 1024 # 64ms per block (at 48kHz: 3072, at 16kHz: 1024)
OUTPUT_BLOCK_SIZE = 1024 # Always exactly 1024 samples (64ms at 16kHz) for Whisper & VAD

RING_BUFFER_DURATION = 0.20  # 200ms pre-roll to capture speech onset completely (Requirement 2: 200-300ms)
MAX_RING_BLOCKS = max(1, int((SAMPLE_RATE * RING_BUFFER_DURATION) / OUTPUT_BLOCK_SIZE))

log(
    f"[AIVA AUDIO DEVICE]\n"
    f"device={selected_device_name}\n"
    f"hostapi={selected_host_api}\n"
    f"sample_rate={SAMPLE_RATE}"
)

# Queues and counters for Part 3 Reconciliation
audio_raw_queue = collections.deque(maxlen=1000)
audio_ring = collections.deque(maxlen=MAX_RING_BLOCKS)
buffer_overflows = 0

chunks_received_total = 0
samples_received_total = 0
chunks_consumed_total = 0

is_recording = False
record_event = threading.Event()
recorded_blocks = []
has_spoken = False
speech_streak = 0
speech_detected_ms = 0
speech_start_time = 0.0
last_speech_time = 0.0
record_start_time = 0.0
max_record_duration = 3.0   # 3.0s normal fast command ceiling (Requirement 1)
silence_timeout = 0.38       # 380ms continuous trailing silence before ending command (Requirement 1: 350-600ms)
min_speech_duration = 0.30   # 300ms minimum speech duration before allowing silence cutoff
speech_frames_count = 0
smoothed_rms = 0.0010

# Robust adaptive noise-floor calibration state (idle tracking)
idle_rms_history = collections.deque(maxlen=100) # ~6.4s of idle blocks
calibrated_noise_floor = 0.0008
speech_start_threshold = 0.0014
speech_end_threshold = 0.0008
idle_blocks_count = 0
recording_lock = threading.Lock()

# Non-blocking, ultra-lightweight PortAudio callback (Part 3)
# ONLY pushes audio frames to queue, zero complex math or heavy logging
def audio_callback(indata, frames, time_info, status):
    global buffer_overflows, chunks_received_total, samples_received_total
    try:
        if status.input_overflow:
            buffer_overflows += 1
        
        # Mix channels if stereo and apply anti-aliased 3:1 decimation
        if use_wasapi_48k:
            if indata.shape[1] >= 2:
                mix = (indata[:, 0] + indata[:, 1]) * 0.5
            else:
                mix = indata[:, 0]
            # Anti-aliasing triangular kernel [0.25, 0.50, 0.25] eliminates high-frequency aliasing
            n_tri = (len(mix) // 3) * 3
            m = mix[:n_tri]
            mono_block = (m[0::3] * 0.25 + m[1::3] * 0.50 + m[2::3] * 0.25).astype(np.float32)
        else:
            if indata.shape[1] >= 2:
                mono_block = ((indata[:, 0] + indata[:, 1]) * 0.5).astype(np.float32)
            else:
                mono_block = indata[:, 0].copy()

        chunks_received_total += 1
        samples_received_total += len(mono_block)
        audio_raw_queue.append(mono_block)
    except Exception as e:
        log(f"[AIVA CALLBACK ERROR] {e}")

# Dedicated background audio processor thread decouples PortAudio from processing
def audio_processor_loop():
    global has_spoken, speech_streak, speech_detected_ms, speech_start_time, last_speech_time
    global is_recording, speech_frames_count, chunks_consumed_total, calibrated_noise_floor
    global speech_start_threshold, speech_end_threshold, smoothed_rms, idle_blocks_count
    global recorded_blocks, pre_roll_duration

    vad_diag_counter = 0

    while True:
        try:
            if not audio_raw_queue:
                time.sleep(0.008)
                continue
            block = audio_raw_queue.popleft()
        except IndexError:
            time.sleep(0.008)
            continue

        chunks_consumed_total += 1
        block_rms = float(np.sqrt(np.mean(block**2)))

        # Always update pre-roll ring buffer
        audio_ring.append(block)

        if not is_recording:
            # Continuous adaptive noise-floor calibration during idle listening
            idle_rms_history.append(block_rms)
            idle_blocks_count += 1
            # Recalculate floor periodically (~every 1 second)
            if idle_blocks_count >= 15 and len(idle_rms_history) >= 20:
                idle_blocks_count = 0
                # 15th percentile locks onto ambient noise floor, ignoring speech and transient spikes
                current_p15 = float(np.percentile(list(idle_rms_history), 15))
                # Exponential moving average for smooth adaptation
                calibrated_noise_floor = 0.85 * calibrated_noise_floor + 0.15 * current_p15
                # Clamp calibrated_noise_floor to realistic acoustic limits [0.0001, 0.0040]
                calibrated_noise_floor = min(max(calibrated_noise_floor, 0.00010), 0.0040)
                speech_start_threshold = min(max(calibrated_noise_floor * 1.8, 0.0012), 0.0080)
                speech_end_threshold = min(max(calibrated_noise_floor * 1.2, 0.0007), 0.0040)
        else:
            # Analyze smoothed RMS energy envelope over time
            smoothed_rms = 0.65 * block_rms + 0.35 * smoothed_rms

            vad_diag_counter += 1
            if vad_diag_counter % 5 == 0 and not has_spoken:
                log(f"[AIVA VAD DIAG] block_rms={block_rms:.6f} smoothed={smoothed_rms:.6f} streak={speech_streak} thresh={speech_start_threshold:.6f}")

            # Hysteresis VAD evaluation
            if not has_spoken:
                if smoothed_rms >= speech_start_threshold:
                    speech_streak += 1
                    # Require 2 consecutive speech frames (~128ms) to confirm speech onset
                    if speech_streak >= 2:
                        has_spoken = True
                        speech_frames_count += speech_streak
                        speech_start_time = time.time()
                        speech_detected_ms = int(speech_start_time * 1000)
                        last_speech_time = speech_start_time
                        # Grab recent ~800ms pre-roll right before speech onset (Requirement G)
                        pre_roll = list(audio_ring)
                        pre_roll_duration = round(len(pre_roll) * (OUTPUT_BLOCK_SIZE / SAMPLE_RATE), 2)
                        recorded_blocks = list(pre_roll)
                        log(f"[AIVA VAD] speech_started=True pre_roll={pre_roll_duration:.2f}s block_rms={block_rms:.6f} smoothed_rms={smoothed_rms:.6f}")
                else:
                    speech_streak = 0

                elapsed = time.time() - record_start_time
                # If no speech detected within 2.0s after wake trigger, stop (Requirement 1)
                if elapsed >= 2.0:
                    log("[AIVA VAD] speech_started=False (timeout after 2.0s)")
                    record_event.set()
            else:
                recorded_blocks.append(block)

                # In speech mode: maintain speech if smoothed energy is above lower end_threshold
                if smoothed_rms >= speech_end_threshold:
                    speech_frames_count += 1
                    last_speech_time = time.time()

                silence_duration = time.time() - last_speech_time
                speech_elapsed = time.time() - speech_start_time

                # Stop after continuous trailing silence >= silence_timeout (0.45s) AND min_speech_duration (0.35s)
                if silence_duration >= silence_timeout and speech_elapsed >= min_speech_duration:
                    log(f"[AIVA VAD] speech_ended=True silence_duration={silence_duration:.2f}s speech_duration={speech_elapsed:.2f}s")
                    record_event.set()

            # Maximum recording ceiling (3.0s normal fast command)
            elapsed = time.time() - record_start_time
            if elapsed >= max_record_duration:
                log(f"[AIVA VAD] max duration reached ({max_record_duration}s)")
                record_event.set()

threading.Thread(target=audio_processor_loop, daemon=True).start()

# Start background audio capture stream (Part 5: runs continuously, never restarts on wake)
try:
    capture_channels = 2 if use_wasapi_48k else 1
    stream_kwargs = {
        'samplerate': HARDWARE_RATE,
        'channels': capture_channels,
        'dtype': 'float32',
        'blocksize': BLOCK_SIZE,
        'callback': audio_callback
    }
    if selected_device_idx is not None:
        stream_kwargs['device'] = selected_device_idx

    stream = sd.InputStream(**stream_kwargs)
    stream.start()
    log(f"[AIVA STT] Microphone audio stream started successfully at {HARDWARE_RATE}Hz float32")
except Exception as e:
    log(f"[AIVA STT] Failed to open microphone stream: {str(e)}")
    emit({"type": "error", "message": f"Failed to open microphone: {str(e)}"})
    sys.exit(1)

# Helper function to write debug WAV (Part 1)
def save_debug_wav(audio_arr, filepath):
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        clipped = np.clip(audio_arr, -1.0, 1.0)
        pcm16 = (clipped * 32767.0).astype(np.int16)
        with wave.open(filepath, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm16.tobytes())
    except Exception as wav_err:
        log(f"[AIVA STT Error] Failed to write debug WAV: {wav_err}")

emit({
    "type": "ready",
    "status": "LOCAL_WHISPER_READY",
    "model": model_name,
    "device": device,
    "compute_type": compute_type
})

def record_and_transcribe_worker(session_max_duration=3.0):
    global is_recording, recorded_blocks, has_spoken, speech_streak, speech_detected_ms
    global speech_start_time, last_speech_time, record_start_time, buffer_overflows
    global speech_frames_count, smoothed_rms, pre_roll_duration, max_record_duration

    if not recording_lock.acquire(blocking=False):
        log("[AIVA STT] Recording already in progress, ignoring duplicate trigger.")
        return

    try:
        max_record_duration = float(session_max_duration)
        buffer_overflows = 0
        speech_frames_count = 0
        speech_streak = 0
        recording_started_ms = int(time.time() * 1000)

        # Track start frames for buffer reconciliation (Part 3)
        rec_start_samples = samples_received_total
        rec_start_chunks_rx = chunks_received_total
        rec_start_chunks_cx = chunks_consumed_total

        # Freeze thresholds for this recording session
        frozen_noise_floor = calibrated_noise_floor
        frozen_start_threshold = speech_start_threshold
        frozen_end_threshold = speech_end_threshold
        smoothed_rms = frozen_noise_floor

        log(
            f"[AIVA VAD]\n"
            f"noise_floor={frozen_noise_floor:.6f}\n"
            f"threshold={frozen_start_threshold:.6f}\n"
            f"end_threshold={frozen_end_threshold:.6f}"
        )

        # Initialize recording buffers (pre-roll will be grabbed upon speech onset)
        recorded_blocks = []
        pre_roll_duration = 0.0
        has_spoken = False
        speech_detected_ms = 0
        speech_start_time = 0.0
        last_speech_time = time.time()
        record_start_time = time.time()
        record_event.clear()
        is_recording = True

        log("[AIVA STT] Recording command audio...")
        emit({"type": "stt_recording_started", "recordingStartedMs": recording_started_ms})

        # Wait until speech ends or timeout
        record_event.wait(timeout=max_record_duration + 0.5)

        # Post-roll buffer capture: preserve ~180ms after speech ends (Requirement 3: 150-250ms)
        post_roll_duration = 0.18 if has_spoken else 0.0
        if post_roll_duration > 0:
            time.sleep(post_roll_duration)
        is_recording = False

        recording_finalized_ms = int(time.time() * 1000)
        speech_ended_ms = int(last_speech_time * 1000) if has_spoken else recording_finalized_ms

        rec_end_samples = samples_received_total
        rec_end_chunks_rx = chunks_received_total
        rec_end_chunks_cx = chunks_consumed_total

        if not recorded_blocks:
            log("[AIVA STT] No audio blocks captured.")
            emit({"type": "no_speech", "duration": 0, "hasSpoken": False})
            return

        audio_data = np.concatenate(recorded_blocks)
        total_samples = len(audio_data)
        total_duration = round(total_samples / SAMPLE_RATE, 2)
        min_val = float(np.min(audio_data))
        max_val = float(np.max(audio_data))
        peak_amp = float(np.max(np.abs(audio_data)))
        rms_amp = float(np.sqrt(np.mean(audio_data**2)))

        # Frame-by-frame analysis (32ms frames = 512 samples)
        frame_size = 512
        num_frames = max(1, total_samples // frame_size)
        silent_frames = 0
        speech_frame_hits = 0
        for i in range(num_frames):
            c_rms = np.sqrt(np.mean(audio_data[i * frame_size : (i + 1) * frame_size] ** 2))
            if c_rms < frozen_end_threshold:
                silent_frames += 1
            else:
                speech_frame_hits += 1
        silence_ratio = round(silent_frames / num_frames, 2)
        speech_ratio = round(speech_frame_hits / num_frames, 2)

        # Durations for metrics
        speech_duration = round(max(0.0, (last_speech_time - speech_start_time)), 2) if has_spoken else 0.0
        trailing_silence = round(max(0.0, (time.time() - last_speech_time - post_roll_duration)), 2) if has_spoken else 0.0
        raw_duration = round(max(0.0, total_duration - pre_roll_duration - post_roll_duration), 2) if has_spoken else total_duration
        final_duration = total_duration

        speech_start_time_str = f"{speech_start_time - record_start_time:.3f}s" if has_spoken else "none"
        speech_end_time_str = f"{last_speech_time - record_start_time:.3f}s" if has_spoken else "none"

        # Save EXACT debug WAV (Part 1)
        debug_wav_path = os.path.join(os.getcwd(), 'backend', 'data', 'debug', 'aiva-last-command.wav')
        save_debug_wav(audio_data, debug_wav_path)

        # Requirement K: Structured Log Block
        log(
            f"[AIVA VAD METRICS]\n"
            f"noise_floor={frozen_noise_floor:.6f}\n"
            f"start_threshold={frozen_start_threshold:.6f}\n"
            f"end_threshold={frozen_end_threshold:.6f}\n"
            f"speech_start_time={speech_start_time_str}\n"
            f"speech_end_time={speech_end_time_str}\n"
            f"speech_duration={speech_duration:.2f}s\n"
            f"silence_duration={trailing_silence:.2f}s\n"
            f"pre_roll_duration={pre_roll_duration:.2f}s\n"
            f"post_roll_duration={post_roll_duration:.2f}s\n"
            f"raw_duration={raw_duration:.2f}s\n"
            f"final_duration={final_duration:.2f}s\n"
            f"speech_ratio={speech_ratio:.2f}"
        )

        # PART 1 — LOG EXACT RAW AUDIO PARAMETERS
        log(
            f"[AIVA RAW AUDIO]\n"
            f"device={selected_device_name}\n"
            f"hostapi={selected_host_api}\n"
            f"sample_rate={SAMPLE_RATE}\n"
            f"channels=1\n"
            f"dtype=float32\n"
            f"frames={total_samples}\n"
            f"duration={total_duration:.2f}s\n"
            f"min={min_val:.6f}\n"
            f"max={max_val:.6f}\n"
            f"peak={peak_amp:.4f}\n"
            f"rms={rms_amp:.4f}\n"
            f"speech_frames={speech_frames_count}\n"
            f"silence_ratio={silence_ratio:.2f}\n"
            f"buffer_overflows={buffer_overflows}"
        )

        # PART 3 — LOG RECONCILIATION METRICS
        chunks_received_during_rec = rec_end_chunks_rx - rec_start_chunks_rx
        chunks_consumed_during_rec = rec_end_chunks_cx - rec_start_chunks_cx
        samples_received_during_rec = rec_end_samples - rec_start_samples

        log(
            f"[AIVA BUFFER RECONCILIATION]\n"
            f"recording_start_frame={rec_start_samples}\n"
            f"recording_end_frame={rec_end_samples}\n"
            f"number_of_chunks_received={chunks_received_during_rec}\n"
            f"number_of_chunks_consumed={chunks_consumed_during_rec}\n"
            f"total_samples_received={samples_received_during_rec}\n"
            f"total_samples_passed_to_whisper={total_samples}"
        )

        # SUMMARY LOG OUTPUT
        log(
            f"[AIVA AUDIO]\n"
            f"duration={total_duration:.2f}s\n"
            f"samples={total_samples}\n"
            f"peak={peak_amp:.4f}\n"
            f"rms={rms_amp:.4f}\n"
            f"speech_frames={speech_frames_count}\n"
            f"buffer_overflows={buffer_overflows}"
        )

        emit({
            "type": "stt_recording_stopped",
            "duration": total_duration,
            "hasSpoken": has_spoken,
            "recordingStartedMs": recording_started_ms,
            "speechDetectedMs": speech_detected_ms,
            "speechEndedMs": speech_ended_ms,
            "recordingFinalizedMs": recording_finalized_ms,
            "bufferOverflows": buffer_overflows
        })

        # Section 9: Hard Production Guard - Do NOT accept pure silence as success
        if not has_spoken or speech_frames_count < 2 or (total_duration > 0.5 and (peak_amp < 0.006 and rms_amp < 0.0004)):
            log("[AIVA AUDIO ERROR] No meaningful microphone signal detected.")
            emit({"type": "no_speech", "duration": total_duration, "hasSpoken": False})
            return

        # Section 7: Print WAV verification details
        wav_file_size = os.path.getsize(debug_wav_path) if os.path.exists(debug_wav_path) else 0
        log(
            f"[AIVA WAV VERIFICATION]\n"
            f"WAV duration: {total_duration:.2f}s\n"
            f"WAV sample rate: {SAMPLE_RATE} Hz\n"
            f"WAV channels: 1 (mono)\n"
            f"WAV PCM format: 16-bit PCM\n"
            f"WAV peak: {peak_amp:.4f}\n"
            f"WAV RMS: {rms_amp:.4f}\n"
            f"WAV file size: {wav_file_size} bytes"
        )

        # Whisper Input Stabilization: Pad to at least 1.0s if needed for convolutional front-end
        if len(audio_data) < SAMPLE_RATE:
            pad_len = SAMPLE_RATE - len(audio_data)
            audio_data = np.pad(audio_data, (0, pad_len), mode='constant')

        whisper_started_ms = int(time.time() * 1000)
        log(f"[AIVA STT] Transcribing {len(audio_data) / SAMPLE_RATE:.2f}s audio with local Whisper {model_name} ({device})...")
        emit({
            "type": "stt_transcribing",
            "duration": round(len(audio_data) / SAMPLE_RATE, 2),
            "whisperStartedMs": whisper_started_ms
        })

        t0 = time.time()
        try:
            # Transcribe with anti-hallucination and prompt stabilization
            segments, info = model.transcribe(
                audio_data,
                beam_size=2,
                best_of=2,
                language="en",
                initial_prompt="AIVA voice assistant command.",
                condition_on_previous_text=False,
                temperature=0.0,
                vad_filter=False,
                no_speech_threshold=0.85,
                compression_ratio_threshold=2.4
            )
            text_list = [segment.text.strip() for segment in segments]
            raw_text = " ".join(text_list).strip()
            latency = round(time.time() - t0, 3)
            whisper_completed_ms = int(time.time() * 1000)

            # PART 13 — LOG AIVA WHISPER
            log(
                f"[AIVA WHISPER]\n"
                f"duration={len(audio_data) / SAMPLE_RATE:.2f}s\n"
                f"latency={latency}s\n"
                f"transcript=\"{raw_text}\""
            )

            emit({
                "type": "transcript",
                "text": raw_text,
                "confidence": 0.98 if raw_text else 0.0,
                "isFinal": True,
                "latency": latency,
                "duration": round(len(audio_data) / SAMPLE_RATE, 2),
                "recordingStartedMs": recording_started_ms,
                "speechDetectedMs": speech_detected_ms,
                "speechEndedMs": speech_ended_ms,
                "recordingFinalizedMs": recording_finalized_ms,
                "whisperStartedMs": whisper_started_ms,
                "whisperCompletedMs": whisper_completed_ms,
                "bufferOverflows": buffer_overflows
            })
        except Exception as e:
            log(f"[AIVA STT Error] Transcription error: {e}")
            emit({"type": "error", "message": f"Transcription error: {str(e)}"})
    finally:
        recording_lock.release()

# Main STDIN command loop
def main():
    global is_recording
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue

            cmd = json.loads(line)
            action = cmd.get("command")

            if action == "record_and_transcribe":
                if not is_recording:
                    max_dur = float(cmd.get("max_duration", 3.0))
                    threading.Thread(target=record_and_transcribe_worker, args=(max_dur,), daemon=True).start()
                else:
                    log("[AIVA STT] Recording already in progress, ignoring duplicate command.")
            elif action == "cancel":
                is_recording = False
                record_event.set()
                log("[AIVA STT] Recording cancelled.")
            elif action == "ping":
                emit({"type": "pong", "time": time.time()})
        except json.JSONDecodeError:
            pass
        except Exception as e:
            log(f"[AIVA STT Error] Stdin loop error: {e}")

if __name__ == "__main__":
    try:
        main()
    finally:
        if 'stream' in locals() and stream.active:
            stream.stop()
            stream.close()
