# A11y Hover Reader

A production-ready Manifest V3 Chrome Extension providing accessibility tools such as hover-to-speech, focus-to-speech, text summarization, and file-reading integrations.

## Installation

1. Navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the created directory (`a11y-hover-reader/`).

## How to Set API Keys

To use remote summarization (like OpenAI) or external TTS:
1. Click the extension icon in the toolbar.
2. Click the ⚙️ (Settings / Options) button in the popup header.
3. Scroll down to **Remote APIs (Optional)**.
4. Check "Enable Remote Summarization" and paste your API key in the corresponding field.
5. Click **Save Settings**. 
*(Note: Code contains `TODO: SET API KEY` where HTTP requests should be hooked up).*

## Testing the Acceptance Criteria

- **Hover Button:** Open `demo.html`, wait for extensions to load, and hover the "Click Me" button. You should hear "Confirm Action" within 0.5s.
- **Tab Focus:** Press the `Tab` key on the keyboard to move focus. It should speak "Focused: ..."
- **Mouse Movement:** Move the mouse rapidly across the screen for >150px. The extension speaks "moving right" or "moving left".
- **Summarize & Read Document:** 
  1. Open the popup dialog via the extension icon.
  2. Use the File input to select a simple `.txt` file (simulating integration).
  3. The file name is announced. Click "Summarize File" to hear the processed text via the local mock summarizer.

## Libraries & Integration (PDF / DOCX)
To add full PDF/DOCX support, download `pdf.min.js`, `pdf.worker.min.js`, and `mammoth.browser.min.js` into the `lib/` folder. Load them inside `popup.html` and invoke them inside the file input reader fallback branch in `popup.js`.
