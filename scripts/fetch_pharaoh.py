import urllib.request
import re

url = 'https://www.deviantart.com/thepharaohsservant/art/972513204'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8')

# Search for any URL in the entire html
urls = re.findall(r'https?://[^\s"\'<>\\]+', html)
interesting = [u for u in set(urls) if any(k in u for k in ['mediafire', 'mega', 'drive', 'dropbox', 'deviantart.com/users/outgoing'])]
print("Interesting URLs in 972513204:", interesting)
