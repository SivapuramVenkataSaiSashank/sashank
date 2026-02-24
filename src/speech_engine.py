"""
speech_engine.py
Handles Speech-to-Text (STT) and Text-to-Speech (TTS).
"""
import threading
import queue
import os
import tempfile
import time


class SpeechEngine:
    def __init__(self, on_result=None, on_error=None, on_status=None):
        """
        on_result(text): called when STT recognises speech
        on_error(msg): called on errors
        on_status(msg): called for status updates
        """
        self.on_result = on_result or (lambda t: None)
        self.on_error = on_error or (lambda m: None)
        self.on_status = on_status or (lambda m: None)

        self._tts_engine = None
        self._tts_lock = threading.Lock()
        self._speaking = False
        self._stop_flag = threading.Event()
        self._listen_thread = None
        self._listening = False

        self._init_tts()
        self._init_pygame()

    # ─────────────────── TTS initialisation ───────────────────

    def _init_tts(self):
        try:
            import pyttsx3
            self._tts_engine = pyttsx3.init()
            self._tts_engine.setProperty("rate", 165)
            voices = self._tts_engine.getProperty("voices")
            # Prefer a female voice if available
            for v in voices:
                if "female" in v.name.lower() or "zira" in v.name.lower():
                    self._tts_engine.setProperty("voice", v.id)
                    break
        except Exception as e:
            self._tts_engine = None
            print(f"[SpeechEngine] pyttsx3 init failed: {e}")

    def _init_pygame(self):
        try:
            import pygame
            pygame.mixer.init()
            self._pygame_ok = True
        except Exception:
            self._pygame_ok = False

    # ─────────────────── TTS public methods ───────────────────

    def speak(self, text: str, use_gtts: bool = False):
        """Speak text in a background thread without blocking the GUI."""
        self._stop_flag.clear()
        self._speaking = True
        t = threading.Thread(target=self._speak_worker, args=(text, use_gtts), daemon=True)
        t.start()

    def stop_speaking(self):
        self._stop_flag.set()
        self._speaking = False
        if self._tts_engine:
            try:
                self._tts_engine.stop()
            except Exception:
                pass
        if self._pygame_ok:
            try:
                import pygame
                pygame.mixer.music.stop()
            except Exception:
                pass

    def is_speaking(self) -> bool:
        return self._speaking

    def _speak_worker(self, text: str, use_gtts: bool):
        if self._stop_flag.is_set():
            self._speaking = False
            return

        if use_gtts and self._pygame_ok:
            self._speak_gtts(text)
        else:
            self._speak_pyttsx3(text)
        self._speaking = False

    def _speak_pyttsx3(self, text: str):
        if not self._tts_engine:
            return
        # Chunk text to allow stop mid-sentence
        sentences = self._split_sentences(text)
        with self._tts_lock:
            for sent in sentences:
                if self._stop_flag.is_set():
                    break
                try:
                    self._tts_engine.say(sent)
                    self._tts_engine.runAndWait()
                except Exception as e:
                    print(f"[SpeechEngine] pyttsx3 speak error: {e}")

    def _speak_gtts(self, text: str):
        try:
            from gtts import gTTS
            import pygame
            sentences = self._split_sentences(text)
            for sent in sentences:
                if self._stop_flag.is_set():
                    break
                tts = gTTS(text=sent, lang="en", slow=False)
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                    tmp_path = f.name
                tts.save(tmp_path)
                pygame.mixer.music.load(tmp_path)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    if self._stop_flag.is_set():
                        pygame.mixer.music.stop()
                        break
                    time.sleep(0.1)
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        except Exception as e:
            print(f"[SpeechEngine] gTTS error: {e}")
            self._speak_pyttsx3(text)

    @staticmethod
    def _split_sentences(text: str) -> list:
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        # Re-chunk to ~200 chars max per chunk for responsiveness
        chunks = []
        buf = ""
        for s in sentences:
            buf += " " + s
            if len(buf) >= 200:
                chunks.append(buf.strip())
                buf = ""
        if buf.strip():
            chunks.append(buf.strip())
        return chunks if chunks else [text]

    # ─────────────────── STT public methods ───────────────────

    def start_listening(self):
        """Begin continuous microphone listening in a background thread."""
        if self._listening:
            return
        self._listening = True
        self._listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._listen_thread.start()

    def stop_listening(self):
        self._listening = False

    def listen_once(self) -> str | None:
        """Blocking single recognition call (called from a thread)."""
        try:
            import speech_recognition as sr
            r = sr.Recognizer()
            r.energy_threshold = 300
            r.dynamic_energy_threshold = True
            with sr.Microphone() as source:
                r.adjust_for_ambient_noise(source, duration=0.5)
                self.on_status("🎙️ Listening…")
                audio = r.listen(source, timeout=8, phrase_time_limit=15)
            text = r.recognize_google(audio)
            return text
        except Exception as e:
            if "WaitTimeoutError" not in str(type(e)):
                self.on_error(f"STT: {e}")
            return None

    def _listen_loop(self):
        try:
            import speech_recognition as sr
        except ImportError:
            self.on_error("SpeechRecognition not installed.")
            return

        r = sr.Recognizer()
        r.energy_threshold = 300
        r.dynamic_energy_threshold = True

        while self._listening:
            try:
                with sr.Microphone() as source:
                    r.adjust_for_ambient_noise(source, duration=0.3)
                    self.on_status("🎙️ Listening…")
                    try:
                        audio = r.listen(source, timeout=6, phrase_time_limit=12)
                    except sr.WaitTimeoutError:
                        self.on_status("🟢 Ready — say a command")
                        continue
                try:
                    text = r.recognize_google(audio)
                    self.on_result(text)
                    self.on_status(f"✅ Heard: {text}")
                except sr.UnknownValueError:
                    self.on_status("❓ Didn't catch that, try again")
                except sr.RequestError as e:
                    self.on_error(f"Google STT unavailable: {e}")
            except Exception as e:
                self.on_error(f"Microphone error: {e}")
                time.sleep(2)
