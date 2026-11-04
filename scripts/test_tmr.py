import urllib.request

url = 'https://www.models-resource.com/'
req = urllib.request.Request(
    url,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }
)
try:
    with urllib.request.urlopen(req) as resp:
        print("Status:", resp.status)
        print("Data length:", len(resp.read()))
except Exception as e:
    print("Error:", e)
