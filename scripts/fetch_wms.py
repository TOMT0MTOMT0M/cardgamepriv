import urllib.request
import re

queries = [
    'gallery:whitemagesunny+Jump+Force',
    'gallery:whitemagesunny+Yu-Gi-Oh',
    'gallery:whitemagesunny+Yugi',
    'gallery:whitemagesunny+Kaiba',
    'gallery:whitemagesunny+Dragon'
]

for q in queries:
    rss_url = f'https://backend.deviantart.com/rss.xml?q={q}&type=deviation'
    try:
        req = urllib.request.Request(rss_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            xml = resp.read().decode('utf-8', 'ignore')
            items = re.findall(r'<item>(.*?)</item>', xml, re.DOTALL)
            print(f"Query '{q}' returned {len(items)} items:")
            for it in items:
                title = re.search(r'<title>(.*?)</title>', it)
                link = re.search(r'<link>(.*?)</link>', it)
                desc = re.search(r'<description>(.*?)</description>', it, re.DOTALL)
                t = title.group(1) if title else ""
                l = link.group(1) if link else ""
                d = desc.group(1) if desc else ""
                gd = re.findall(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', d)
                print(f"  [{t}] -> {gd}")
    except Exception as e:
        print(f"Error {q}:", e)
