"""
bookmarks.py
Manages document bookmarks with persistence.
"""
import json
import os


class BookmarkManager:
    def __init__(self, data_dir: str = "data"):
        self._data_dir = data_dir
        self._bookmarks = {}  # filepath -> list of {page, label, note}
        self._current_file = None
        os.makedirs(data_dir, exist_ok=True)

    def set_document(self, filepath: str):
        self._current_file = filepath
        self._load(filepath)

    def add_bookmark(self, page_index: int, label: str, note: str = "") -> bool:
        if self._current_file is None:
            return False
        bms = self._bookmarks.setdefault(self._current_file, [])
        # Avoid duplicate page bookmarks
        for bm in bms:
            if bm["page"] == page_index:
                bm["label"] = label
                bm["note"] = note
                self._save()
                return True
        bms.append({"page": page_index, "label": label, "note": note})
        self._save()
        return True

    def remove_bookmark(self, page_index: int) -> bool:
        if self._current_file is None:
            return False
        bms = self._bookmarks.get(self._current_file, [])
        original_len = len(bms)
        self._bookmarks[self._current_file] = [b for b in bms if b["page"] != page_index]
        if len(self._bookmarks[self._current_file]) < original_len:
            self._save()
            return True
        return False

    def get_bookmarks(self) -> list:
        return self._bookmarks.get(self._current_file, [])

    def get_last_bookmark(self) -> dict | None:
        bms = self.get_bookmarks()
        return bms[-1] if bms else None

    def is_bookmarked(self, page_index: int) -> bool:
        return any(b["page"] == page_index for b in self.get_bookmarks())

    # ─────────────────── Persistence ───────────────────

    def _bookmark_path(self, filepath: str) -> str:
        safe_name = os.path.basename(filepath).replace(" ", "_").replace(".", "_") + "_bookmarks.json"
        return os.path.join(self._data_dir, safe_name)

    def _save(self):
        if self._current_file:
            path = self._bookmark_path(self._current_file)
            with open(path, "w") as f:
                json.dump(self._bookmarks.get(self._current_file, []), f, indent=2)

    def _load(self, filepath: str):
        path = self._bookmark_path(filepath)
        if os.path.exists(path):
            try:
                with open(path) as f:
                    self._bookmarks[filepath] = json.load(f)
            except Exception:
                self._bookmarks[filepath] = []
        else:
            self._bookmarks[filepath] = []
