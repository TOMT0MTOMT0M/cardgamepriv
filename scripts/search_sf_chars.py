import urllib.request
import json

headers = {'User-Agent': 'Mozilla/5.0'}
for q in ['seto+kaiba', 'yami+yugi', 'yugi+muto', 'kaiba']:
    url = f'https://api.sketchfab.com/v3/search?type=models&q={q}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"=== Results for {q} ===")
            for r in data.get('results', [])[:8]:
                uid = r.get('uid')
                name = r.get('name')
                is_dl = r.get('isDownloadable')
                user = r.get('user', {}).get('username')
                print(f"  [{uid}] '{name}' by {user} (dl: {is_dl})")
    except Exception as e:
        print(f"Error {q}:", e)
