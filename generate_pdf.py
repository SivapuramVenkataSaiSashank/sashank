import markdown
import os
import subprocess

with open('UI_Requirements_Report.md', 'r', encoding='utf-8') as f:
    text = f.read()

html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<title>UI Requirements Report</title>
<style>
body {{
    font-family: Arial, sans-serif;
    line-height: 1.6;
    padding: 20px;
    color: #111;
}}
h1, h2, h3 {{
    color: #333;
}}
code {{
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 4px;
}}
</style>
</head>
<body>
{markdown.markdown(text)}
</body>
</html>
"""

with open('UI_Requirements_Report.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

pwd = os.getcwd()
html_path = os.path.join(pwd, 'UI_Requirements_Report.html')
pdf_path = os.path.join(pwd, 'UI_Requirements_Report.pdf')

browser_paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
]

executable = None
for p in browser_paths:
    if os.path.exists(p):
        executable = p
        break

if not executable:
    print("Could not find Edge or Chrome executable")
    exit(1)

print(f"Using browser {executable} to generate PDF at {pdf_path}")
subprocess.run([
    executable,
    '--headless',
    '--disable-gpu',
    f'--print-to-pdf={pdf_path}',
    f'file:///{html_path}'
], check=True)
print("Done.")
