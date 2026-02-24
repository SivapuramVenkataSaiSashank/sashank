# 🎨 UI Requirements Report: VoiceRead AI Assistant

**Project Description:** A voice-activated AI reading accessibility assistant designed for blind or visually impaired learners. The UI needs to be highly readable, robust, and accessible, built around a dark mode or high-contrast theme (as implied by the existing color variables like `--bg-card`, `--text-muted`, `--border`).

## 1. Global & Layout Components
These are the macro-level structures that hold the application together.

*   **App Shell / Main Container:** A full-screen layout divided into a Sidebar (left) and Main Content Area (right).
*   **Startup Screen / Splash:** A centered overlay with a large title "🔊 VoiceRead" and a prompt saying "Press any key on your keyboard to start".
*   **Top Header (Main Area):**
    *   **Title:** "🔊 VoiceRead"
    *   **Subtitle:** "Voice-Activated AI Reading Assistant for Blind Learners"
    *   **Badge:** Small text indicating the version/project "HackxAmrita 2.0".
*   **Status Bar (Bottom of Main Area):** A slim bar at the bottom showing a colored dot (Status indicator: green/red/yellow) and a text message (e.g., "Ready", "Loading...", "Error").
*   **Tabs Navigation Bar:** A horizontal row of 4 tab buttons to switch main views:
    1.  📄 Document
    2.  💬 Chat
    3.  🎙️ Voice
    4.  📖 Commands
*   **Global Voice Overlay (Heads-Up Display):** A floating pill-shaped banner at the top center of the screen that appears when the microphone is active (Ctrl+M). It needs:
    *   A pulsing animation or spinner.
    *   State text: "Listening..." or "Processing...".
    *   Real-time transcription text appearing dynamically.

## 2. Sidebar Components
The sidebar manages the file, navigation, and bookmarks.

*   **Branding Header:** App name and a smaller sub-label.
*   **API Status Badge:** A small colored pill. (States: Green "✅ Groq AI Ready" / Orange "⚠️ API key not set").
*   **Drag & Drop Upload Zone:**
    *   A dashed/dotted border rectangular area.
    *   Icon (📄 Document icon or ⏳ Loading spinner).
    *   Text: "Click or drag PDF / DOCX / EPUB / TXT".
    *   Needs a visual hover/drag state.
*   **Document Info Panel** (Visible when a file is loaded):
    *   **File Name Title** & **Metadata Text** (e.g., "PDF · 24 pages").
    *   **Metrics Pills:** Two side-by-side boxes showing [Current Page] and [Total Pages].
    *   **Pagination Row:** Two buttons side-by-side: "◀ Prev" and "Next ▶".
    *   **Jump to Page Input:** A numeric text box paired with a "Go →" button.
*   **Bookmarks List Section:**
    *   Section Header with a "+ Add" ghost button.
    *   **Bookmark Item Row:** Contains a page badge (e.g., "p.5"), a text label, and a small "×" delete button. Needs a hover state.

## 3. Tab Views & Content Areas

### A. Document Tab (`📄 Document`)
Displays the parsed text and search features.
*   **Empty State:** Large folder icon 📂, title "No Document Loaded", and instruction text.
*   **Search Bar:**
    *   Full-width text input with a magnifying glass.
    *   "Search" button (with loading spinner state).
    *   "Clear" ghost button (appears when results are shown).
*   **Search Results Card:** A container showing the count of results and a list of clickable text snippets highlighting the matched text.
*   **Reader Area:**
    *   Header row showing "Page X of Y" and a small file extension badge.
    *   Large text area for reading the document content out loud.
*   **Action Buttons (Bottom):** "▶️ Read Aloud" (Green/Success styled) and "⏹️ Stop" (Ghost styling).

### B. Chat Tab (`💬 Chat`)
A conversational interface for interacting with the document.
*   **Missing API Warning Card:** A stylized card containing a key icon 🔑, warning text, and a code block snippet showing `.env` file setup.
*   **Chat History Area (Scrollable):**
    *   **Empty State:** Icon 💬, Title, and a grid of "Suggestion Chips" (small buttons like "Summarize key points", "What is the main topic?").
    *   **User Message Bubble:** Right-aligned, primary color background (e.g., Blue), white text.
    *   **AI Message Bubble:** Left-aligned, gray/card background. Includes a small "🔊 Read" button underneath the response.
    *   **System Message Bubble:** Highlighted text indicating a system event ("🤖 System:").
    *   **Thinking/Typing Indicator:** A small left-aligned bubble with a spinner.
*   **Pending Confirmation Alert:** An info banner asking for voice confirmation ("Yes/No") with a red "Cancel" button.
*   **Input Box Area (Bottom):** Text input field and a "Send" button. Input needs a "disabled" state when AI is generating.

### C. Voice Tab (`🎙️ Voice`)
The primary manual fallback for voice controls.
*   **Mic Control Center (Card):**
    *   A massive, prominent Microphone Button (needs Idle 🎤, Active/Pulsing 🎙️, and Loading ⏳ UI states).
    *   Helper text below it explaining keyboard shortcuts.
*   **Type a Command (Card):** A section with a text input field ("e.g. summarize") and a "▶ Run" button.
*   **Quick Actions Grid (Card):** A 2-column or 4-column grid of equal-sized secondary buttons for: Read Page, Stop, Summarize, Prev, Next, Bookmark, Go BM, Help.

### D. Commands Tab (`📖 Commands`)
A pure information/reference page layout.
*   **Info Banner:** Top alert block with info styling.
*   **Command Dictionary Table/List:** Categorized lists (Reading, AI, Navigation, Bookmarks). Each row should have a highlighted "Command Keyword" (e.g., `"read document"`) and its corresponding "Description".
*   **Tips Card:** A styled container with a bulleted list of helpful application tips.

## 4. Reusable UI Primitives (Design System Requirements)
Ensure Dora.run generates this set of core design tokens:
1.  **Buttons:**
    *   Primary (Blue)
    *   Secondary/Outline (Dark gray/border)
    *   Success (Green)
    *   Danger (Red)
    *   Ghost/Transparent (minimal visual weight)
    *   *Sizes:* Normal, Small (for badges/bookmarks) and Full-width.
2.  **Inputs:** Text inputs, Number inputs, and fully styled `textarea` or rich-text containers.
3.  **Containers:** "Cards" with rounded corners (e.g., `12px` or `16px` border-radius), subtle borders, and optional drop-shadows.
4.  **Feedback Elements:**
    *   Alert boxes (Info, Warning, Error variant styles).
    *   Spinners (circular loading rings).
    *   Status dots (tiny colored circles).
