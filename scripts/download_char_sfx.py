import urllib.request
import re
import os

headers = {'User-Agent': 'Mozilla/5.0'}

targets = [
    {
        'search': 'https://www.myinstants.com/en/search/?name=seto+kaiba',
        'out': 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/sfx/seto-kaiba.mp3',
        'name': 'seto-kaiba'
    },
    {
        'search': 'https://www.myinstants.com/en/search/?name=it%27s+time+to+duel',
        'out': 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/sfx/yami-yugi.mp3',
        'name': 'yami-yugi'
    }
]

for t in targets:
    try:
        req = urllib.request.Request(t['search'], headers=headers)
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            m = re.findall(r'/media/sounds/[^\'"]+\.mp3', html)
            if m:
                mp3_url = 'https://www.myinstants.com' + m[0]
                print(f"[{t['name']}] Found MP3: {mp3_url}")
                with urllib.request.urlopen(urllib.request.Request(mp3_url, headers=headers)) as r, open(t['out'], 'wb') as f:
                    f.write(r.read())
                print(f"[{t['name']}] Saved: {t['out']} ({os.path.getsize(t['out'])} bytes)")
    except Exception as e:
        print(f"Error {t['name']}: {e}")
