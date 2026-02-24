# VoiceRead — AI Reading Assistant for Blind Learners 🎙️📚

> **HackxAmrita 2.0 Hackathon Project**  
> *Voice-activated AI summarization and reading assistant for blind learners*

---

## Problem Statement
Blind or visually impaired learners face difficulty accessing digital documents like PDFs. Current AI summarization tools require manual selection or clicking, making them inaccessible for people who rely on voice commands.

**Our Solution:** A fully voice-controlled AI reading assistant that lets users:
- Open documents via voice
- Get AI-generated summaries read aloud
- Navigate, bookmark, and ask questions — all hands-free

---

## Features
| Feature | Description |
|---------|-------------|
| 🎙️ Voice Control | 12+ natural voice commands with live transcription |
| ✨ AI Summarization | Short / Medium / Detailed summaries via Google Gemini |
| 💬 Voice Q&A | Ask questions about the document, AI answers aloud |
| 📄 Multi-format | PDF, DOCX, EPUB, TXT supported |
| 🔖 Bookmarks | Save & jump to positions, persisted across sessions |
| 📖 Read Aloud | Full document or page-by-page TTS playback |
| 🔍 Search | Full-text search with highlighting |
| 📤 Export | Save AI summary as .txt file |
| 🌙 Dark UI | High-contrast accessible dark theme |

---

## 🧩 A11y Hover Reader Extension (Included)
This project includes a custom Chrome/Edge extension (**A11y Hover Reader**) that provides a live proximity radar and reads out elements instantly on hover.

**How to connect and use it:**
1. Open Chrome or Edge and go to `chrome://extensions/` (or `edge://extensions/`).
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and select the `a11y-hover-reader` folder inside this project.
4. Pin the extension to your browser toolbar. Use `Ctrl+Shift+A` or click the icon to toggle it ON/OFF.
5. While ON, hover over any button, text field, or document text in the VoiceRead app, and it will read it aloud using the native browser TTS.


---

## Setup & Run

### Option 1: One-click launcher (Windows)
```
Double-click run.bat
```

### Option 2: Manual
```bash
# Clone / download the project
cd "HackxAmrita 2.0"

# Create virtual environment
python -m venv venv

# Activate
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run
python main.py
```

---

## Getting a Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key
5. In the app, click **🔑 Set API Key** (top-right) and paste it

The key is used only locally and never stored permanently.

---

## Voice Commands
| Say this... | Action |
|------------|--------|
| `"open file"` | Open file picker |
| `"read document"` | Read current page aloud |
| `"summarize"` | AI summary of entire doc |
| `"summarize briefly"` | Short 2-3 sentence summary |
| `"summarize chapter 3"` | AI summary of chapter 3 |
| `"next page"` | Go to next page |
| `"go to page 5"` | Jump to page 5 |
| `"bookmark this"` | Save current position |
| `"go to bookmark"` | Return to bookmark |
| `"ask what is the main topic"` | AI Q&A |
| `"export summary"` | Save summary to file |
| `"stop"` | Stop reading |
| `"help"` | Hear all commands |

---

## Tech Stack
| Component | Technology |
|-----------|------------|
| Language | Python 3.10+ |
| GUI | Tkinter (dark themed, animated) |
| AI | Google Gemini 1.5 Flash |
| Voice Input | SpeechRecognition (Google STT) |
| Voice Output | pyttsx3 (offline) + gTTS (online) |
| PDF | PyMuPDF (fitz) |
| Word | python-docx |
| eBook | ebooklib + BeautifulSoup4 |

---

## Project Structure
```
HackxAmrita 2.0/
├── main.py               ← Entry point + Tkinter GUI
├── requirements.txt      ← Python dependencies
├── run.bat               ← One-click Windows launcher
├── src/
│   ├── document_processor.py  ← PDF/DOCX/EPUB text extraction
│   ├── speech_engine.py       ← STT + TTS engine
│   ├── ai_summarizer.py       ← Google Gemini integration
│   ├── voice_assistant.py     ← Voice command router
│   └── bookmarks.py           ← Bookmark persistence
└── data/                 ← Bookmark JSON files (auto-created)
```

---

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Toggle microphone on/off |
| `Esc` | Stop speaking immediately |
| `Enter` (in Q&A box) | Submit typed question |
| `Enter` (in page box) | Jump to that page |

---

## Inspiration
Built by studying these open-source projects:
- [Bookworm](https://github.com/blindpandas/bookworm) — Accessible document reader
- [VoCo App](https://github.com/uzibytes/Voco_App) — SIH 2022 Winner for VI users
- [Blind-Assistant](https://github.com/kavipriya2004/Blind-Assistant) — STT/TTS/PDF assistant
- [Vakta](https://github.com/krrish-v/vakta) — LLM voice learning platform
- [VoiceAid](https://github.com/sankeer28/VoiceAid) — Gemini-powered doc QA

---

*Made with ❤️ for HackxAmrita 2.0*
