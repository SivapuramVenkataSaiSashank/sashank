"""
voice_assistant.py
Central command router and state machine for voice control.
"""
import re
import threading


class VoiceAssistant:
    """
    Routes recognized voice commands to the appropriate actions.
    Callbacks are provided at construction to decouple from the UI.
    """

    def __init__(self, doc_processor, speech_engine, ai_summarizer, bookmark_manager,
                 on_status=None, on_ai_result=None, on_page_change=None, on_file_open=None,
                 on_export=None):
        self.doc = doc_processor
        self.speech = speech_engine
        self.ai = ai_summarizer
        self.bookmarks = bookmark_manager

        self.on_status = on_status or (lambda m: None)
        self.on_ai_result = on_ai_result or (lambda m: None)
        self.on_page_change = on_page_change or (lambda: None)
        self.on_file_open = on_file_open or (lambda: None)
        self.on_export = on_export or (lambda: None)

        self._reading_thread = None
        self._stop_read = threading.Event()

    # ─────────────────── Main command dispatcher ───────────────────

    def handle_command(self, text: str):
        """Parse and execute a voice command string."""
        cmd = text.lower().strip()
        self.on_status(f"🗣️ Command: {text}")

        # ── File operations ──
        if any(k in cmd for k in ["open file", "open document", "load file", "open book"]):
            self.on_file_open()
            return

        # ── Help ──
        if "help" in cmd:
            self._cmd_help()
            return

        # ── Reading ──
        if any(k in cmd for k in ["read document", "read all", "read page", "start reading", "read this"]):
            self._cmd_read_current()
            return

        if "read chapter" in cmd or "read section" in cmd:
            num = self._extract_number(cmd)
            if num:
                self._cmd_read_chapter(num)
            else:
                self._cmd_read_current()
            return

        # ── Stop ──
        if any(k in cmd for k in ["stop", "pause", "quiet", "silence", "enough"]):
            self._cmd_stop()
            return

        # ── Summarize ──
        if "summarize" in cmd or "summary" in cmd:
            length = "medium"
            if "short" in cmd or "brief" in cmd:
                length = "short"
            elif "detail" in cmd or "long" in cmd or "full" in cmd:
                length = "detailed"

            chapter_num = self._extract_number(cmd) if ("chapter" in cmd or "section" in cmd) else None
            self._cmd_summarize(chapter_num, length)
            return

        # ── Navigation ──
        if "next page" in cmd or "next section" in cmd or "forward" in cmd:
            self._cmd_next_page()
            return

        if any(k in cmd for k in ["previous page", "prev page", "go back", "back page", "last page"]):
            self._cmd_prev_page()
            return

        if "go to page" in cmd or "jump to page" in cmd or "page number" in cmd:
            num = self._extract_number(cmd)
            if num:
                self._cmd_go_to_page(num)
            else:
                self.speech.speak("Please say the page number after 'go to page'.")
            return

        if "first page" in cmd or "beginning" in cmd or "start" in cmd:
            self._cmd_go_to_page(1)
            return

        if "last page" in cmd or "end of document" in cmd:
            self._cmd_go_to_page(self.doc.page_count())
            return

        # ── Bookmarks ──
        if "bookmark" in cmd and ("add" in cmd or "save" in cmd or "mark" in cmd or cmd.strip() == "bookmark this"):
            self._cmd_add_bookmark()
            return

        if "remove bookmark" in cmd or "delete bookmark" in cmd:
            self._cmd_remove_bookmark()
            return

        if "go to bookmark" in cmd or "show bookmark" in cmd or "my bookmark" in cmd:
            self._cmd_go_bookmark()
            return

        # ── Q&A ──
        if cmd.startswith("ask") or cmd.startswith("question") or "what is" in cmd or \
           "who is" in cmd or "explain" in cmd or "tell me" in cmd or "how does" in cmd or \
           "where is" in cmd or "when" in cmd:
            question = re.sub(r'^(ask|question)\s*', '', cmd, flags=re.IGNORECASE).strip()
            if not question:
                question = cmd
            self._cmd_ask(question)
            return

        # ── Export ──
        if "export" in cmd or "save summary" in cmd or "save to file" in cmd:
            self._cmd_export()
            return

        # ── Unknown ──
        self.speech.speak(f"I didn't understand '{text}'. Say 'help' for a list of commands.")

    # ─────────────────── Command implementations ───────────────────

    def _cmd_help(self):
        help_text = (
            "Here are the available voice commands: "
            "Say 'open file' to load a document. "
            "Say 'read document' to hear the current page. "
            "Say 'summarize' to get an AI summary. "
            "Say 'next page' or 'previous page' to navigate. "
            "Say 'go to page' followed by a number. "
            "Say 'bookmark this' to save your position. "
            "Say 'go to bookmark' to return to it. "
            "Say 'ask' followed by your question to query the document. "
            "Say 'export summary' to save the summary as a text file. "
            "Say 'stop' to halt speech at any time."
        )
        self.speech.speak(help_text)

    def _cmd_read_current(self):
        if not self.doc.file_path:
            self.speech.speak("No document is open. Say open file to load one.")
            return
        text = self.doc.get_current_text()
        label = self.doc.get_current_label()
        self.on_status(f"📖 Reading: {label}")
        self.speech.speak(f"{label}. {text}")

    def _cmd_read_chapter(self, num: int):
        if not self.doc.file_path:
            self.speech.speak("No document is open.")
            return
        text = self.doc.get_chapter_text(num)
        if text:
            self.doc.go_to_page(num - 1)
            self.on_page_change()
            self.speech.speak(f"Chapter {num}. {text}")
        else:
            self.speech.speak(f"Chapter {num} not found.")

    def _cmd_stop(self):
        self.speech.stop_speaking()
        self.on_status("⏹️ Stopped")

    def _cmd_summarize(self, chapter_num=None, length="medium"):
        if not self.doc.file_path:
            self.speech.speak("Please open a document first.")
            return
        if not self.ai.is_ready():
            self.speech.speak("AI summarizer is not ready. Please enter your Gemini API key.")
            return

        if chapter_num:
            text = self.doc.get_chapter_text(chapter_num)
            source = f"chapter {chapter_num}"
        else:
            text = self.doc.get_full_text()
            source = "the document"

        self.on_status(f"🤖 Summarizing {source}…")
        self.speech.speak(f"Generating {length} summary of {source}. Please wait.")

        def on_done(summary):
            self.on_ai_result(summary)
            self.on_status("✅ Summary ready")
            self.speech.speak(summary)

        self.ai.summarize_async(text, length, on_done)

    def _cmd_next_page(self):
        if not self.doc.file_path:
            return
        if self.doc.next_page():
            label = self.doc.get_current_label()
            self.on_page_change()
            self.speech.speak(f"Moving to {label}")
        else:
            self.speech.speak("You are on the last page.")

    def _cmd_prev_page(self):
        if not self.doc.file_path:
            return
        if self.doc.prev_page():
            label = self.doc.get_current_label()
            self.on_page_change()
            self.speech.speak(f"Moving to {label}")
        else:
            self.speech.speak("You are on the first page.")

    def _cmd_go_to_page(self, num: int):
        if not self.doc.file_path:
            return
        if self.doc.go_to_page(num - 1):
            label = self.doc.get_current_label()
            self.on_page_change()
            self.speech.speak(f"Going to {label}")
        else:
            total = self.doc.page_count()
            self.speech.speak(f"Page {num} not found. The document has {total} pages.")

    def _cmd_add_bookmark(self):
        if not self.doc.file_path:
            self.speech.speak("No document is open.")
            return
        idx = self.doc.current_page
        label = self.doc.get_current_label()
        self.bookmarks.add_bookmark(idx, label)
        self.speech.speak(f"Bookmarked {label}.")
        self.on_page_change()

    def _cmd_remove_bookmark(self):
        if not self.doc.file_path:
            return
        idx = self.doc.current_page
        label = self.doc.get_current_label()
        if self.bookmarks.remove_bookmark(idx):
            self.speech.speak(f"Bookmark removed from {label}.")
        else:
            self.speech.speak("No bookmark on this page.")
        self.on_page_change()

    def _cmd_go_bookmark(self):
        if not self.doc.file_path:
            self.speech.speak("No document is open.")
            return
        bms = self.bookmarks.get_bookmarks()
        if not bms:
            self.speech.speak("You have no bookmarks for this document.")
            return
        last = bms[-1]
        self.doc.go_to_page(last["page"])
        self.on_page_change()
        self.speech.speak(f"Going to bookmarked page: {last['label']}.")

    def _cmd_ask(self, question: str):
        if not self.doc.file_path:
            self.speech.speak("Please open a document first.")
            return
        if not self.ai.is_ready():
            self.speech.speak("AI is not configured. Please enter your Gemini API key.")
            return

        context = self.doc.get_full_text()
        self.on_status(f"🤖 Answering: {question}")
        self.speech.speak(f"Looking up: {question}")

        def on_done(answer):
            self.on_ai_result(answer)
            self.on_status("✅ Answer ready")
            self.speech.speak(answer)

        self.ai.ask_async(question, context, on_done)

    def _cmd_export(self):
        summary = self.ai.get_last_summary()
        if not summary:
            self.speech.speak("No summary to export. Please summarize the document first.")
            return
        self.on_export()

    # ─────────────────── Utility ───────────────────

    @staticmethod
    def _extract_number(text: str) -> int | None:
        # Written numbers
        words = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
            "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
        }
        for word, val in words.items():
            if word in text:
                return val
        # Digit
        match = re.search(r'\b(\d+)\b', text)
        if match:
            return int(match.group(1))
        return None
