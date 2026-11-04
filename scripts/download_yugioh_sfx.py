import urllib.request
import urllib.parse
import re
import os

SFX_DIR = r"C:\Users\Tom\Desktop\cardgamepriv\public\fx\yugioh\sfx"
os.makedirs(SFX_DIR, exist_ok=True)

TARGETS = {
    "blue-eyes-white-dragon": ["blue-eyes", "blue eyes white dragon"],
    "dark-magician": ["dark-magician", "dark magician"],
    "dark-magician-girl": ["dark magician girl"],
    "exodia-the-forbidden-one": ["exodia", "exodia obliterate"],
    "slifer-the-sky-dragon": ["slifer", "slifer the sky dragon"],
    "red-eyes-black-dragon": ["red-eyes", "red eyes black dragon"]
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for card_name, queries in TARGETS.items():
    dest_path = os.path.join(SFX_DIR, f"{card_name}.mp3")
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
        print(f"Already exists: {dest_path}")
        continue
    
    found = False
    for q in queries:
        if found:
            break
        search_url = f"https://www.myinstants.com/en/search/?name={urllib.parse.quote(q)}"
        print(f"Searching for '{q}' via {search_url}...")
        try:
            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
                matches = re.findall(r'/media/sounds/[^\'"]+\.mp3', html)
                if matches:
                    mp3_url = "https://www.myinstants.com" + matches[0]
                    print(f"Found MP3: {mp3_url}")
                    mp3_req = urllib.request.Request(mp3_url, headers=headers)
                    with urllib.request.urlopen(mp3_req, timeout=10) as mp3_resp, open(dest_path, 'wb') as f:
                        f.write(mp3_resp.read())
                    print(f"Successfully saved {dest_path} ({os.path.getsize(dest_path)} bytes)")
                    found = True
        except Exception as e:
            print(f"Search failed for {q}: {e}")

