import urllib.request
import json

headers = {'User-Agent': 'Mozilla/5.0'}
url = 'https://api.sketchfab.com/v3/search?type=models&q=obelisk+tormentor'
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"=== Results for obelisk tormentor ===")
        for r in data.get('results', [])[:15]:
            uid = r.get('uid')
            name = r.get('name')
            is_dl = r.get('isDownloadable')
            price = r.get('price')
            user = r.get('user', {}).get('username')
            print(f"  [{uid}] '{name}' by {user} (dl: {is_dl}, price: {price})")
except Exception as e:
    print("Error:", e)
