import urllib.request
import re

url = 'https://www.mediafire.com/file/yk78ad2y62j3hor/Cross_Duel_Models_%282.0%29.rar/file'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', 'ignore')
        # Find direct download link
        m = re.search(r'href=[\'"](https?://download[^\'"]+)[\'"]', html)
        if m:
            print("Direct DL:", m.group(1))
        # Find file size
        size_m = re.search(r'<li>File size:\s*<span>(.*?)</span>', html)
        if size_m:
            print("Size:", size_m.group(1))
        title_m = re.search(r'<title>(.*?)</title>', html)
        if title_m:
            print("Title:", title_m.group(1))
except Exception as e:
    print("Error:", e)
