"""
document_processor.py
Handles text extraction from PDF, DOCX, and EPUB files.
"""
import os
import re

class DocumentProcessor:
    def __init__(self):
        self.pages = []          # list of {"index": int, "text": str, "label": str}
        self.current_page = 0
        self.file_path = None
        self.doc_type = None
        self.title = "Untitled Document"

    # ─────────────────────────── Public API ───────────────────────────

    def load(self, filepath: str) -> bool:
        """Load a document and return True on success."""
        ext = os.path.splitext(filepath)[1].lower()
        self.pages = []
        self.current_page = 0
        self.file_path = filepath
        self.title = os.path.basename(filepath)

        try:
            if ext == ".pdf":
                self._load_pdf(filepath)
                self.doc_type = "PDF"
            elif ext in (".docx", ".doc"):
                self._load_docx(filepath)
                self.doc_type = "DOCX"
            elif ext == ".epub":
                self._load_epub(filepath)
                self.doc_type = "EPUB"
            elif ext == ".txt":
                self._load_txt(filepath)
                self.doc_type = "TXT"
            else:
                return False
            return len(self.pages) > 0
        except Exception as e:
            print(f"[DocumentProcessor] Load error: {e}")
            return False

    def page_count(self) -> int:
        return len(self.pages)

    def get_page(self, index: int) -> str:
        if 0 <= index < len(self.pages):
            return self.pages[index]["text"]
        return ""

    def get_current_text(self) -> str:
        return self.get_page(self.current_page)

    def get_current_label(self) -> str:
        if 0 <= self.current_page < len(self.pages):
            return self.pages[self.current_page]["label"]
        return "Unknown"

    def next_page(self) -> bool:
        if self.current_page < len(self.pages) - 1:
            self.current_page += 1
            return True
        return False

    def prev_page(self) -> bool:
        if self.current_page > 0:
            self.current_page -= 1
            return True
        return False

    def go_to_page(self, index: int) -> bool:
        if 0 <= index < len(self.pages):
            self.current_page = index
            return True
        return False

    def get_full_text(self, max_chars: int = 50000) -> str:
        """Return combined text of all pages (truncated for AI)."""
        combined = "\n\n".join(p["text"] for p in self.pages)
        return combined[:max_chars]

    def get_chapter_text(self, chapter_num: int) -> str:
        """Return text of a specific chapter/page (1-indexed)."""
        idx = chapter_num - 1
        if 0 <= idx < len(self.pages):
            return self.pages[idx]["text"]
        return ""

    def search(self, query: str) -> list:
        """Search text and return list of (page_index, snippet) matches."""
        results = []
        q = query.lower()
        for page in self.pages:
            text = page["text"].lower()
            pos = text.find(q)
            if pos != -1:
                snippet = page["text"][max(0, pos-60):pos+120]
                results.append({"page": page["index"], "label": page["label"], "snippet": snippet})
        return results

    # ─────────────────────────── Private loaders ───────────────────────

    def _load_pdf(self, filepath: str):
        import fitz  # PyMuPDF
        doc = fitz.open(filepath)
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                self.pages.append({
                    "index": i,
                    "text": text,
                    "label": f"Page {i + 1}"
                })
        doc.close()

    def _load_docx(self, filepath: str):
        from docx import Document
        doc = Document(filepath)
        # Split by headings into chapters, otherwise into chunks
        current_chunk = []
        chapter_idx = 0
        chapter_label = "Section 1"

        for para in doc.paragraphs:
            if para.style.name.startswith("Heading"):
                if current_chunk:
                    self.pages.append({
                        "index": chapter_idx,
                        "text": "\n".join(current_chunk),
                        "label": chapter_label
                    })
                    chapter_idx += 1
                chapter_label = para.text.strip() or f"Section {chapter_idx + 1}"
                current_chunk = []
            else:
                if para.text.strip():
                    current_chunk.append(para.text.strip())

        if current_chunk:
            self.pages.append({
                "index": chapter_idx,
                "text": "\n".join(current_chunk),
                "label": chapter_label
            })

        # If no headings found, chunk by ~500 words
        if not self.pages:
            all_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            words = all_text.split()
            chunk_size = 500
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i:i + chunk_size])
                self.pages.append({
                    "index": i // chunk_size,
                    "text": chunk,
                    "label": f"Section {i // chunk_size + 1}"
                })

    def _load_epub(self, filepath: str):
        import ebooklib
        from ebooklib import epub
        from bs4 import BeautifulSoup

        book = epub.read_epub(filepath)
        chapter_idx = 0
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_content(), "html.parser")
                text = soup.get_text(separator="\n").strip()
                if len(text) > 100:
                    title_tag = soup.find(["h1", "h2", "h3"])
                    label = title_tag.get_text().strip() if title_tag else f"Chapter {chapter_idx + 1}"
                    self.pages.append({
                        "index": chapter_idx,
                        "text": text,
                        "label": label
                    })
                    chapter_idx += 1

    def _load_txt(self, filepath: str):
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        words = content.split()
        chunk_size = 600
        for i in range(0, len(words), chunk_size):
            chunk = " ".join(words[i:i + chunk_size])
            self.pages.append({
                "index": i // chunk_size,
                "text": chunk,
                "label": f"Section {i // chunk_size + 1}"
            })
