import glob, os, requests, zipfile, io

# Download the static Super OTC (all weights, all regions)
url = "https://github.com/adobe-fonts/source-han-serif/releases/download/2.003R/01_SourceHanSerif.ttc.zip"
dest = "fonts/SourceHanSerif.ttc.zip"

print("Downloading Source Han Serif Static Super OTC (this may take a while)...")
r = requests.get(url, stream=True, timeout=300)
r.raise_for_status()

total_size = int(r.headers.get('content-length', 0))
downloaded = 0
with open(dest, 'wb') as f:
    for chunk in r.iter_content(chunk_size=8192):
        f.write(chunk)
        downloaded += len(chunk)
        if total_size > 0:
            pct = downloaded * 100 // total_size
            print(f"\r  Progress: {pct}% ({downloaded/1024/1024:.0f} MB / {total_size/1024/1024:.0f} MB)", end='')

print(f"\nDownloaded: {dest} ({os.path.getsize(dest)/1024/1024:.0f} MB)")

# List contents
with zipfile.ZipFile(dest, 'r') as z:
    for info in z.infolist():
        if 'tw' in info.filename.lower() or 'TW' in info.filename:
            print(f"  TW variant: {info.filename} ({info.file_size/1024/1024:.1f} MB)")
    print("All files:")
    for info in z.infolist():
        print(f"  {info.filename} ({info.file_size/1024/1024:.1f} MB)")
