import glob, os
from pypdf import PdfReader, PdfWriter

assets = 'outputs/world-instruments-static/assets'
files = glob.glob(os.path.join(assets, '*A9*.pdf'))
print(f"Found: {files}")
reader = PdfReader(files[0])
print(f"Total pages: {len(reader.pages)}")

# Check page 2 text (about section)
text = reader.pages[1].extract_text() if len(reader.pages) > 1 else reader.pages[0].extract_text()
print(f"Page 2 text preview: {text[:200]}")

# Read the raw PDF content to check font names
with open(files[0], 'rb') as f:
    raw = f.read()

# Search for font references in raw PDF
import re
font_refs = set()
for m in re.finditer(rb'/Font\b[^>]*?>>', raw):
    font_refs.add(m.group(0)[:200])
for m in re.finditer(rb'/BaseFont\s*/([^\s/]+)', raw):
    font_refs.add(m.group(1)[:100])

print(f"\nFont references found: {len(font_refs)}")
for fr in sorted(list(font_refs))[:20]:
    print(f"  {fr}")
