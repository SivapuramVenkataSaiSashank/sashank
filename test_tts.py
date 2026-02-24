from TTS.api import TTS
import time

print("Loading TTS model...")
start = time.time()
tts = TTS("tts_models/en/ljspeech/vits")
print(f"Loaded in {time.time() - start:.2f}s")
print("Synthesizing audio...")
tts.tts_to_file(text="Hello! This is a test of Coqui TTS.", file_path="test_coqui.wav")
print("Done! Saved to test_coqui.wav")
