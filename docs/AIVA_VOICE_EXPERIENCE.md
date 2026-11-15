# AIVA 2.0 Natural Voice-First Experience & Audio Architecture

**Voice Persona:** AIVA (`af_bella` ONNX @ 1.05 speed)  
**Audio Pipeline:** Clause-Streamed Pipelined TTS + Full-Duplex Barge-In  

---

## 1. Zero-Lag Audio Streaming Architecture

In AIVA 2.0, the traditional 4-5 second full-paragraph synthesis delay is eliminated:
1. **Clause Pipelining:** Sentences are immediately tokenized into clauses upon token generation.
2. **First Audio Latency:** First clause synthesis audio starts playing within **~200 ms**.
3. **Audio-Text Synchronization:** Text reveal is synchronized strictly on `audio.onplay()`, ensuring exactly **0 ms gap** between spoken speech and visible text captions.
4. **Instant Barge-In:** `BargeInController` handles user voice interruptions or spacebar presses in `<10 ms`, immediately halting active audio streams and unblocking the microphone.
5. **Multilingual & Tanglish:** Full comprehension of Tamil, Tanglish, and English with automatic dialect switching.

