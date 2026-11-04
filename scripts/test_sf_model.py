import urllib.request
import json

for uid in ['f40a68cd07d04c648ce8e66f64cf6544', '938ad22de6ae4794b6b403c51e1bf96c', 'e1be89810b0d4bcfb7a7ce84a5353019']:
    url = f'https://api.sketchfab.com/v3/models/{uid}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("Name:", data.get('name'))
            print("License:", data.get('license', {}).get('label'))
    except Exception as e:
        print(f"Error {uid}:", e)
