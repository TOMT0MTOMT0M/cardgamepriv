import urllib.request
import re

for dev_id in ['988932632', '1078526111', '990851570', '980225988', '979916800', '977321068']:
    url = f'https://www.deviantart.com/thepharaohsservant/art/{dev_id}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode('utf-8')
            m = re.findall(r'<div class="legacy-journal[^>]*>(.*?)</div>', html, re.DOTALL)
            text = m[0] if m else ""
            # clean text
            clean = re.sub(r'<[^>]+>', ' ', text)
            print(f"=== {dev_id} ===")
            print(clean[:300].strip())
    except Exception as e:
        print(f"Error {dev_id}:", e)
