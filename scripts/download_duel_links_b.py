import urllib.request
import re
import sys
import os
import time

mf_url = 'https://www.mediafire.com/file/8fwwxsn4gv00xay/Duel_Links_B.rar/file'
output_dir = r'C:\Users\Tom\Desktop\cardgamepriv\imports'
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'Duel_Links_B.rar')

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
print("Fetching fresh direct download link from MediaFire...")
req = urllib.request.Request(mf_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', 'ignore')

m = re.search(r'href=[\'"](https?://download[^\'"]+)[\'"]', html)
if not m:
    print("Could not find direct download link.")
    sys.exit(1)

dl_url = m.group(1)
print(f"Downloading from {dl_url}...")
print(f"Destination: {output_path}")

req = urllib.request.Request(dl_url, headers=headers)
start_time = time.time()
with urllib.request.urlopen(req) as resp, open(output_path, 'wb') as out_f:
    total_size = int(resp.headers.get('Content-Length', 0))
    downloaded = 0
    chunk_size = 2 * 1024 * 1024 # 2MB
    last_print = 0
    while True:
        chunk = resp.read(chunk_size)
        if not chunk:
            break
        out_f.write(chunk)
        downloaded += len(chunk)
        now = time.time()
        if now - last_print > 3:
            percent = (downloaded / total_size * 100) if total_size else 0
            speed = (downloaded / (now - start_time)) / (1024 * 1024)
            print(f"Progress: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB ({percent:.1f}%) - Speed: {speed:.2f} MB/s")
            last_print = now

print(f"Download complete! Total: {downloaded / (1024*1024):.1f} MB in {time.time() - start_time:.1f}s")
