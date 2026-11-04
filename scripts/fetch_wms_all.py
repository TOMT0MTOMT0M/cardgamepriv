import urllib.request
import re

for offset in range(600, 2400, 60):
    rss_url = f'https://backend.deviantart.com/rss.xml?q=gallery:whitemagesunny&offset={offset}&type=deviation'
    try:
        req = urllib.request.Request(rss_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            xml = resp.read().decode('utf-8', 'ignore')
            items = re.findall(r'<item>(.*?)</item>', xml, re.DOTALL)
            if not items:
                print("No more items at offset", offset)
                break
            for it in items:
                title = re.search(r'<title>(.*?)</title>', it)
                t = title.group(1) if title else ""
                desc = re.search(r'<description>(.*?)</description>', it, re.DOTALL)
                d = desc.group(1) if desc else ""
                if any(k in t.lower() or k in d.lower() for k in ['force', 'yugioh', 'yu-gi-oh', 'kaiba', 'yugi', 'slifer', 'obelisk', 'exodia', 'magician', 'eyes', 'dragon', 'seto', 'jaden', 'muto']):
                    gd = re.findall(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', d)
                    print(f"[{offset}] TITLE: {t} -> GDRIVE: {gd}")
    except Exception as e:
        print(f"Error at {offset}: {e}")
