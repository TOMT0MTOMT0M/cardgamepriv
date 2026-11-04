import urllib.request
import re

for query in ['sab64+kaiba', 'sab64+seto', 'sab64+slifer', 'sab64+obelisk']:
    url = f'https://backend.deviantart.com/rss.xml?q={query}'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})) as resp:
            xml = resp.read().decode('utf-8', 'ignore')
            items = re.findall(r'<item>(.*?)</item>', xml, re.DOTALL)
            print(f"=== {query} ===")
            for it in items:
                title = re.search(r'<title>(.*?)</title>', it)
                link = re.search(r'<link>(.*?)</link>', it)
                t = title.group(1) if title else ""
                l = link.group(1) if link else ""
                if 'download' in t.lower() or 'model' in t.lower():
                    print(f"  [{t}] -> {l}")
    except Exception as e:
        print(f"Error {query}:", e)
