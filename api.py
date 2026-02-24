"""
api.py  — FastAPI backend for EchoVision
Serves the React frontend via REST endpoints.
API key loaded from .env (GEMINI_API_KEY).
"""

import os
import sys
import io
import re
import json
import tempfile
import base64
import threading

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# ── path setup ──────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR  = os.path.join(BASE_DIR, "src")
DATA_DIR = os.path.join(BASE_DIR, "data")
sys.path.insert(0, SRC_DIR)
os.makedirs(DATA_DIR, exist_ok=True)

from document_processor import DocumentProcessor
from ai_summarizer       import AISummarizer
from bookmarks           import BookmarkManager
from fuzzy_search        import search_files

# ── load .env ───────────────────────────────────────────
load_dotenv(os.path.join(BASE_DIR, ".env"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()

# ── singletons ──────────────────────────────────────────
doc = DocumentProcessor()
ai  = AISummarizer()
bm  = BookmarkManager(DATA_DIR)

# Auto-initialise AI if key present in .env
if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    ai.set_api_key(GROQ_API_KEY)

# ██████  App  ████████████████████████████████████████████
app = FastAPI(title="EchoVision API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════
#  Pydantic models
# ══════════════════════════════════════════════════════════
class NavigateBody(BaseModel):
    action: str          # "next" | "prev" | "goto" | "first" | "last"
    page:   int = 0      # 0-indexed, used only for "goto"

class SummarizeBody(BaseModel):
    length:      str = "medium"   # short | medium | detailed
    chapter_num: int | None = None  # 1-indexed; None = full doc

class AskBody(BaseModel):
    question: str
    history: list[dict] = []


class BookmarkBody(BaseModel):
    page:  int
    label: str = ""

class TTSBody(BaseModel):
    text: str

class ApiKeyBody(BaseModel):
    key: str

class CommandBody(BaseModel):
    text: str


# ══════════════════════════════════════════════════════════
#  STATUS
# ══════════════════════════════════════════════════════════
@app.get("/api/status")
def status():
    return {
        "api_ready":   ai.is_ready(),
        "doc_loaded":  bool(doc.file_path and doc.page_count() > 0),
        "doc_title":   doc.title,
        "doc_type":    doc.doc_type,
        "page_count":  doc.page_count(),
        "current_page": doc.current_page,
    }


# ══════════════════════════════════════════════════════════
#  API KEY
# ══════════════════════════════════════════════════════════
@app.post("/api/set_key")
def set_key(body: ApiKeyBody):
    ok = ai.set_api_key(body.key.strip())
    if ok:
        return {"ok": True, "message": "Gemini AI connected ✅"}
    raise HTTPException(400, detail="Invalid API key. Check and try again.")


# ══════════════════════════════════════════════════════════
#  GEMINI CLI INTEROP
# ══════════════════════════════════════════════════════════
def get_filename_from_gemini(query: str) -> str:
    """Uses the `gemini` CLI to extract searchable keywords from conversational input."""
    import subprocess
    safe_query = query.replace('"', '\\"')
    prompt = f"Analyze this voice search query: '{safe_query}'. Extract ONLY the core keywords the user is looking for. Ignore conversational filler (e.g., 'find', 'search for', 'can you get', 'open'). If the keywords appear misspelled or slightly off (e.g. 'presentaton' instead of 'presentation'), CORRECT the spelling. If the keywords form a partial name (e.g. 'presentation guide' for 'presentation guide nlp'), return the clearest searchable base string ('presentation guide'). Respond with JUST the extracted phrase. Strictly no quotes, no periods, and no code blocks."
    
    try:
        cmd = f'gemini -p "{prompt}"'
        result = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT)
        lines = [line.strip() for line in result.strip().split('\n') if line.strip()]
        if lines:
            return lines[-1]
        return query
    except subprocess.CalledProcessError as e:
        print(f"Error calling gemini: {e}")
        try:
             result = subprocess.check_output(['gemini', 'ask', prompt], text=True)
             return result.strip()
        except:
             return query
    except FileNotFoundError:
        print("Gemini CLI not found in PATH.")
        return query


# ══════════════════════════════════════════════════════════
#  DOCUMENT UPLOAD
# ══════════════════════════════════════════════════════════
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    import subprocess
    try:
        subprocess.run(["taskkill", "/IM", "narrator.exe", "/F"], capture_output=True)
    except Exception:
        pass
        
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".pdf", ".docx", ".doc", ".epub", ".txt"):
        raise HTTPException(400, detail=f"Unsupported file type: {ext}")

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(await file.read())
    tmp.close()

    ok = doc.load(tmp.name)
    if not ok:
        raise HTTPException(500, detail="Could not parse document.")

    bm.set_document(tmp.name)

    return {
        "ok":          True,
        "title":       str(doc.title or "Untitled"),
        "doc_type":    str(doc.doc_type or "doc"),
        "page_count":  doc.page_count(),
        "current_page": 0,
        "label":       str(doc.get_current_label() or "Page 1"),
        "text":        str(doc.get_current_text() or ""),
    }


# ══════════════════════════════════════════════════════════
#  PAGE ACCESS
# ══════════════════════════════════════════════════════════
@app.get("/api/page/{n}")
def get_page(n: int):
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")
    doc.go_to_page(n)
    return {
        "page":  doc.current_page,
        "total": doc.page_count(),
        "label": str(doc.get_current_label() or ""),
        "text":  str(doc.get_current_text() or ""),
    }


@app.post("/api/navigate")
def navigate(body: NavigateBody):
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")

    if body.action == "next":
        doc.next_page()
    elif body.action == "prev":
        doc.prev_page()
    elif body.action == "goto":
        doc.go_to_page(body.page)
    elif body.action == "first":
        doc.go_to_page(0)
    elif body.action == "last":
        doc.go_to_page(doc.page_count() - 1)

    return {
        "page":  doc.current_page,
        "total": doc.page_count(),
        "label": str(doc.get_current_label() or ""),
        "text":  str(doc.get_current_text() or ""),
    }


# ══════════════════════════════════════════════════════════
#  SEARCH
# ══════════════════════════════════════════════════════════
@app.get("/api/search")
def search(q: str):
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")
    results = doc.search(q)
    return {"results": results, "count": len(results)}


# ══════════════════════════════════════════════════════════
#  FULL TEXT (for AI)
# ══════════════════════════════════════════════════════════
@app.get("/api/full_text")
def full_text():
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")
    return {"text": doc.get_full_text()}


# ══════════════════════════════════════════════════════════
#  AI SUMMARIZE
# ══════════════════════════════════════════════════════════
@app.post("/api/summarize")
def summarize(body: SummarizeBody):
    if not ai.is_ready():
        raise HTTPException(503, detail="Gemini API not configured. Set your key first.")
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")

    text = (doc.get_chapter_text(body.chapter_num)
            if body.chapter_num
            else doc.get_full_text())
            
    # Return a Server-Sent Events stream
    def sse_generator():
        for chunk in ai.summarize(text, body.length):
            yield chunk

    return StreamingResponse(sse_generator(), media_type="text/plain")


# ══════════════════════════════════════════════════════════
#  AI Q&A
# ══════════════════════════════════════════════════════════
@app.post("/api/ask")
def ask(body: AskBody):
    if not ai.is_ready():
        raise HTTPException(503, detail="Gemini API not configured.")
    if not doc.page_count():
        raise HTTPException(400, detail="No document loaded.")
        
    def sse_generator():
        # 1. Contextualize the query to handle follow-up questions
        standalone_question = ai.contextualize_query(body.question, body.history)
        
        # 2. Retrieve the most relevant chunks using ChromaDB using the STANDALONE question
        relevant_context = doc.get_relevant_context(standalone_question, n_results=5)
        
        # 3. Pass the ORIGINAL question & history to the AI for generation (preserves natural dialogue)
        for chunk in ai.ask(body.question, relevant_context, body.history):
            yield chunk
            
    return StreamingResponse(sse_generator(), media_type="text/plain")


# ══════════════════════════════════════════════════════════
#  BOOKMARKS
# ══════════════════════════════════════════════════════════
@app.get("/api/bookmarks")
def get_bookmarks():
    return {"bookmarks": bm.get_bookmarks()}

@app.post("/api/bookmarks")
def add_bookmark(body: BookmarkBody):
    label = body.label or doc.get_current_label()
    bm.add_bookmark(body.page, label)
    return {"ok": True, "bookmarks": bm.get_bookmarks()}

@app.delete("/api/bookmarks/{page}")
def delete_bookmark(page: int):
    bm.remove_bookmark(page)
    return {"ok": True, "bookmarks": bm.get_bookmarks()}


# ══════════════════════════════════════════════════════════
#  TTS  (Coqui TTS → wav bytes)
# ══════════════════════════════════════════════════════════
tts_model = None
tts_lock = threading.Lock()
tts_cache = {}

def get_tts():
    global tts_model
    with tts_lock:
        if tts_model is None:
            # eSpeak NG must be in PATH on Windows for Coqui TTS processing
            espeak_path = r"C:\Program Files\eSpeak NG"
            if espeak_path not in os.environ.get("PATH", ""):
                os.environ["PATH"] += os.pathsep + espeak_path
                
def get_tts():
    global tts_model
    with tts_lock:
        if tts_model is None:
            # eSpeak NG must be in PATH on Windows for Coqui TTS processing
            espeak_path = r"C:\Program Files\eSpeak NG"
            if espeak_path not in os.environ.get("PATH", ""):
                os.environ["PATH"] += os.pathsep + espeak_path
                
            from TTS.api import TTS
            # Load high-quality VITS model (excellent speed/quality ratio)
            tts_model = TTS("tts_models/en/ljspeech/vits")
    return tts_model

def warm_up_tts():
    model = get_tts()
    # Generate the common phrases to pre-warm the model and populate the cache
    phrases = [
        "Welcome to EchoVision. Please upload a document to begin.",
        "Okay, cancelled. Please try asking again.",
        "I didn't catch that. Please say yes to proceed, or no to cancel."
    ]
    for text in phrases:
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            model.tts_to_file(text=text, file_path=tmp_path)
            with open(tmp_path, "rb") as f:
                tts_cache[text] = f.read()
            os.remove(tmp_path)
        except Exception:
            pass # ignore warmup errors

# Pre-load and warm up TTS in the background so it's ready when the user connects
threading.Thread(target=warm_up_tts, daemon=True).start()

@app.post("/api/tts")
def tts(body: TTSBody):
    try:
        if body.text in tts_cache:
            buf = io.BytesIO(tts_cache[body.text])
            return StreamingResponse(buf, media_type="audio/wav", headers={"Content-Disposition": "inline"})

        model = get_tts()
        
        # TTS API typically requires writing to a file, so we use a tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        # Ensure we don't exceed model sequence length safely
        text_to_speak = body.text[:3500] 
        model.tts_to_file(text=text_to_speak, file_path=tmp_path)
        
        with open(tmp_path, "rb") as f:
            audio_data = f.read()
            
        os.remove(tmp_path)
        
        # Cache the generated audio
        if len(tts_cache) > 100:
            tts_cache.pop(next(iter(tts_cache)))
        tts_cache[body.text] = audio_data
        
        buf = io.BytesIO(audio_data)
        return StreamingResponse(buf, media_type="audio/wav",
                                 headers={"Content-Disposition": "inline"})
    except Exception as e:
        raise HTTPException(500, detail=f"TTS error: {e}")


# ══════════════════════════════════════════════════════════
#  VOICE COMMAND DISPATCH
# ══════════════════════════════════════════════════════════
session_state = {"awaiting_file": False, "files": []}
VOICE_DOCS_DIR = os.path.join(BASE_DIR, "VoiceRead_Docs")
os.makedirs(VOICE_DOCS_DIR, exist_ok=True)

@app.post("/api/command")
def command(body: CommandBody):
    """
    Parse a natural-language voice command and return action + fresh page state.
    The heavy lifting stays on the server so React stays simple.
    """
    global session_state
    c = body.text.lower().strip()

    # 🌟 HIGHEST PRIORITY OVERRIDE: OS File Picker
    if any(k in c for k in ["open other file", "browse computer", "browse folders", "open different file", "open another file", "another file"]):
        session_state["awaiting_file"] = False
        import subprocess
        try:
            subprocess.Popen(["cmd.exe", "/c", "start", "narrator"])
        except Exception:
            pass
        return {"action": "open_file_dialog", "message": "Opening computer file browser...", "tts_text": "Opening your computer's file browser. Please use your screen reader to select a file."}

    def page_state():
        return {
            "page":  doc.current_page,
            "total": doc.page_count(),
            "label": doc.get_current_label(),
            "text":  doc.get_current_text(),
        }

    def num_from(text):
        words = {"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,
                 "eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"fifteen":15,"twenty":20}
        for w,v in words.items():
            if w in text: return v
        m = re.search(r'\b(\d+)\b', text)
        return int(m.group(1)) if m else None

    if "help" in c:
        return {"action":"speak","message":"Commands: open file, read document, summarize, brief summary, detailed summary, next page, previous page, go to page N, bookmark this, go to bookmark, ask your question, export summary, stop."}

    if any(k in c for k in ["stop","pause","quiet"]):
        session_state["awaiting_file"] = False
        return {"action":"stop","message":"Stopped."}

    if session_state.get("awaiting_file"):
        files = session_state["files"]
        offset = session_state.get("files_offset", 0)
        
        if any(k in c for k in ["cancel", "nevermind"]):
            session_state["awaiting_file"] = False
            return {"action": "speak", "message": "Cancelled file selection.", "tts_text": "Okay, cancelled."}



        # Handling "next" pagination
        if any(k in c for k in ["next", "more", "continue", "next page"]):
            new_offset = offset + 5
            if new_offset >= len(files):
                return {"action": "speak", "message": "You are at the end of the list. Say 'previous' to go back.", "tts_text": "You are at the end of the list. Say 'previous' to go back."}
            
            session_state["files_offset"] = new_offset
            chunk = files[new_offset:new_offset+5]
            tts_parts = [f"Reading files {new_offset+1} to {min(new_offset+5, len(files))}."]
            for i, f in enumerate(chunk):
                clean_name = f['name'].replace('.pdf','').replace('.docx','').replace('.doc','')
                tts_parts.append(f"{new_offset+i+1}: {clean_name}.")
            tts_parts.append("Say the number, the name, or 'next' for more.")
            return {"action": "speak", "message": "Listening for file selection...", "tts_text": " ".join(tts_parts)}

        # Handling "previous" pagination
        if any(k in c for k in ["previous", "back", "go back", "previous page"]):
            if offset == 0:
                return {"action": "speak", "message": "You are at the beginning of the list. Say 'next' for more.", "tts_text": "You are already at the beginning of the list. Say 'next' for more."}
            
            new_offset = max(0, offset - 5)
            session_state["files_offset"] = new_offset
            chunk = files[new_offset:new_offset+5]
            tts_parts = [f"Reading files {new_offset+1} to {min(new_offset+5, len(files))}."]
            for i, f in enumerate(chunk):
                clean_name = f['name'].replace('.pdf','').replace('.docx','').replace('.doc','')
                tts_parts.append(f"{new_offset+i+1}: {clean_name}.")
            tts_parts.append("Say the number, the name, or 'next' for more.")
            return {"action": "speak", "message": "Listening for file selection...", "tts_text": " ".join(tts_parts)}

        session_state["awaiting_file"] = False
        n = num_from(c)
        selected_file = None
        if n and 1 <= n <= len(files):
            selected_file = files[n-1]
        else:
            for f in files:
                clean_name = f['name'].lower().replace(".pdf","").replace(".docx","").replace(".txt","").replace(".epub","")
                if clean_name in c:
                    selected_file = f
                    break
        
        if selected_file:
            ok = doc.load(selected_file['path'])
            if ok:
                bm.set_document(selected_file['path'])
                session_state["awaiting_file"] = False # Reset on successful load
                session_state["files"] = []
                return {
                    "action": "file_loaded",
                    "title": str(doc.title or selected_file['name']),
                    "ext": str(doc.doc_type or "doc"),
                    "message": f"Opened {selected_file['name']}. Say 'read document' to start.",
                    "tts_text": f"Opened {selected_file['name']}. You can say 'read document' or 'summarize'.",
                    **page_state()
                }
            return {"action": "error", "message": f"Could not load {selected_file['name']}.", "tts_text": "Sorry, there was an error loading the file."}
        return {"action": "speak", "message": "File not recognized. Please try say 'open file' again.", "tts_text": "I didn't catch that. Please try saying open file again."}

    # GLOBAL VOICE SEARCH
    if any(k in c for k in ["search for", "find my", "look for", "locate"]):
        # Extract keywords via Gemini CLI
        target = get_filename_from_gemini(c)
        
        # Determine search paths based on OS
        user_home = os.path.expanduser("~")
        search_dirs = [
             os.path.join(user_home, "Documents"),
             os.path.join(user_home, "Downloads"),
             os.path.join(user_home, "Desktop"),
             VOICE_DOCS_DIR
        ]
        
        found_matches = []
        for d in search_dirs:
             if os.path.exists(d):
                 found_matches.extend(search_files(target, d, limit=2))
        
        # Sort globally by score and take top 5
        found_matches.sort(key=lambda x: x['score'], reverse=True)
        top_matches = found_matches[:5]
        
        if not top_matches:
            return {"action": "speak", "message": f"No files found matching '{target}'.", "tts_text": f"I couldn't find any documents matching {target}."}
            
        session_state["awaiting_file"] = True
        # Format the matches correctly for the file loader loop above
        session_state["files"] = [{"name": m["filename"], "path": m["path"]} for m in top_matches]
        session_state["files_offset"] = 0
        
        tts_parts = [f"I found {len(top_matches)} matches for {target}."]
        for i, m in enumerate(top_matches):
             clean_name = m['filename'].replace('.pdf','').replace('.docx','').replace('.doc','')
             tts_parts.append(f"{i+1}: {clean_name}.")
        tts_parts.append("Which one would you like to open? Say the number, or say 'repeat names'.")
        
        return {
             "action": "speak", 
             "message": f"Found matching files. Say a number (1-{len(top_matches)}) to select.",
             "tts_text": " ".join(tts_parts)
        }

    # REPEAT CURRENT FILE LIST
    if session_state.get("awaiting_file", False) and any(k in c for k in ["repeat", "say that again", "what were the options", "repeat names"]):
        files = session_state["files"]
        offset = session_state.get("files_offset", 0)
        chunk = files[offset:offset+5]
        tts_parts = [f"Here are the options again."]
        for i, f in enumerate(chunk):
            clean_name = f['name'].replace('.pdf','').replace('.docx','').replace('.doc','')
            tts_parts.append(f"{offset+i+1}: {clean_name}.")
        tts_parts.append("Say the number or name to open.")
        return {"action": "speak", "message": "Repeating options...", "tts_text": " ".join(tts_parts)}

    # LOCAL FOLDER SEARCH (The Study Desk fallback)
    if any(k in c for k in ["open file", "upload document", "upload file", "open document"]):
        # Find files ONLY in VoiceRead_Docs ("The Study Desk")
        search_dirs = [VOICE_DOCS_DIR]
        
        found_files = []
        for d in search_dirs:
            if not os.path.exists(d): continue
            try:
                for f in os.listdir(d):
                    if f.lower().endswith(('.pdf', '.docx', '.doc')):
                        found_files.append({"name": f, "path": os.path.join(d, f)})
            except PermissionError:
                pass
                
        # Sort by modification time so newest are read first
        found_files.sort(key=lambda x: os.path.getmtime(x['path']) if os.path.exists(x['path']) else 0, reverse=True)

        if not found_files:
            return {"action": "speak", "message": "No documents found in VoiceRead_Docs folder. Say 'open other file' to browse your computer.", "tts_text": "I could not find any documents on your study desk. Say 'open other file' to browse your computer."}
        
        session_state["awaiting_file"] = True
        session_state["files"] = found_files
        session_state["files_offset"] = 0
        
        tts_parts = [f"I found {len(found_files)} files on your study desk."]
        
        chunk = found_files[:5]
        for i, f in enumerate(chunk):
            clean_name = f['name'].replace('.pdf','').replace('.docx','').replace('.doc','')
            tts_parts.append(f"{i+1}: {clean_name}.")
            
        if len(found_files) > 5:
            tts_parts.append("Say the number, the name, say 'next', or say 'open other file' to browse your computer.")
        else:
            tts_parts.append("Which one would you like to open? Say the number, the name, or say 'open other file' to browse your computer.")
        
        return {"action": "speak", "message": f"Listening for file selection (1-{len(found_files)})...", "tts_text": " ".join(tts_parts)}



    if not doc.page_count():
        return {"action":"error","message":"No document loaded."}

    if any(k in c for k in ["read document","read page","read this","start reading"]):
        t = doc.get_current_label() + ". " + doc.get_current_text()
        return {"action":"read","tts_text":t, **page_state()}

    if "next page" in c or c == "next" or "forward" in c:
        doc.next_page()
        return {"action":"navigate","message":doc.get_current_label(), **page_state()}

    if any(k in c for k in ["previous page","prev page","go back"]):
        doc.prev_page()
        return {"action":"navigate","message":doc.get_current_label(), **page_state()}

    if "go to page" in c or "jump to page" in c:
        n = num_from(c)
        if n: doc.go_to_page(n-1)
        return {"action":"navigate","message":doc.get_current_label(), **page_state()}

    if "first page" in c or "beginning" in c:
        doc.go_to_page(0); return {"action":"navigate", **page_state()}

    if "last page" in c or "end of" in c:
        doc.go_to_page(doc.page_count()-1); return {"action":"navigate", **page_state()}

    if "short summary" in c or "brief summary" in c:
        return {"action": "stream_summary", "length": "short", **page_state()}
    if "detailed summary" in c or "long summary" in c:
        return {"action": "stream_summary", "length": "detailed", **page_state()}
    if "summarize" in c or "summary" in c:
        return {"action": "stream_summary", "length": "medium", **page_state()}

    if "bookmark" in c and any(k in c for k in ["add","save","mark","this"]):
        bm.add_bookmark(doc.current_page, doc.get_current_label())
        return {"action":"bookmark","message":f"Bookmarked: {doc.get_current_label()}","bookmarks":bm.get_bookmarks()}

    if "go to bookmark" in c or "my bookmark" in c:
        bookmarks = bm.get_bookmarks()
        if bookmarks:
            b = bookmarks[-1]; doc.go_to_page(b["page"])
            return {"action":"navigate","message":b["label"], **page_state()}
        return {"action":"error","message":"No bookmarks saved."}

    # If it loosely looks like a question or command, let the AI handle it instead of throwing an error
    # This solves the issue of commands like "any exact three sentences" failing because they lack "what is"
    # We treat anything longer than 2 words that didn't match native app commands as a question for the document.
    if len(c.split()) >= 2:
        if not ai.is_ready():
            return {"action":"error","message":"Gemini API key not configured."}
        return {"action": "stream_answer", "question": c, **page_state()}

    return {"action":"error","message":f"Command not recognized: {c}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
