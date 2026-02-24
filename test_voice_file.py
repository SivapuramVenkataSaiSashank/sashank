import os
import sys

# Change dir to where api.py is
sys.path.insert(0, r"c:\Users\trang\Downloads\edits\copy 1")
from api import command, CommandBody, doc, SESSION_STATE, session_state

try:
    print(command(CommandBody(text="open file")))
    print(command(CommandBody(text="one")))
    print("Page count:", doc.page_count())
    print("ALL GOOD")
except Exception as e:
    print(f"ERROR: {e}")
