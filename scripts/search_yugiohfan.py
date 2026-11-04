import urllib.request
import json

url = 'https://api.sketchfab.com/v3/models?user=Yugiohfan'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"Total models by Yugiohfan: {data.get('totalCount', 0)}")
        for r in data.get('results', []):
            print(f"  [{r.get('uid')}] '{r.get('name')}' (dl: {r.get('isDownloadable')})")
except Exception as e:
    print("Error:", e)
