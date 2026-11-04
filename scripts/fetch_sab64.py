import urllib.request
import re

url = 'https://www.deviantart.com/sab64/art/MMD-Model-Obelisk-the-Tormentor-Download-816328647'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', 'ignore')

# Search for any link ending in .zip, .rar, .7z
archives = re.findall(r'https?://[^\s"\'<>\\]+\.(?:zip|rar|7z)[^\s"\'<>\\]*', html)
print("Archives found:", archives)

# Search for downloadUrl or similar in JSON:
for m in re.findall(r'"downloadUrl":\s*"([^"]+)"', html):
    print("downloadUrl:", m)
