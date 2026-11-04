import urllib.request
import re

url = 'https://www.deviantart.com/thepharaohsservant/art/972513204'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8')

m = re.findall(r'<div class="legacy-journal[^>]*>(.*?)</div>', html, re.DOTALL)
if m:
    print("Full legacy journal:\n", m[0])
