import urllib.request
import re

url = 'https://www.deviantart.com/misakimodding/art/Jump-Force-Dark-Magician-Girl-3D-model-821044670'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', 'ignore')

idx = 0
while True:
    pos = html.lower().find('http', idx)
    if pos == -1:
        break
    link = html[pos:pos+150].split('"')[0].split("'")[0].split('\\')[0].split('<')[0]
    if any(k in link.lower() for k in ['mega', 'mediafire', 'drive.google', 'sta.sh', 'dropbox']):
        print("FOUND:", link)
    idx = pos + 4
