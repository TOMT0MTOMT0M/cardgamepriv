import urllib.request
import re

url = 'https://www.mediafire.com/file/zryawp2rure8vqd/Cross_Duel_Data.rar/file'
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.deviantart.com/'
})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', 'ignore')
        m = re.search(r'href=[\'"](https?://download[^\'"]+)[\'"]', html)
        if m:
            print("Direct DL:", m.group(1))
        size_m = re.search(r'<li>File size:\s*<span>(.*?)</span>', html)
        if size_m:
            print("Size:", size_m.group(1))
        title_m = re.search(r'<title>(.*?)</title>', html)
        if title_m:
            print("Title:", title_m.group(1))
except Exception as e:
    print("Error:", e)
