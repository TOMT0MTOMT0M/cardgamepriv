import urllib.request

urls = [
    'https://t.co/LyJ07E5aqk?amp=1',
    'https://tinyurl.com/jtvyr6c5'
]

for u in urls:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            print(f"{u} -> {resp.geturl()}")
    except Exception as e:
        print(f"Error {u}:", e)
