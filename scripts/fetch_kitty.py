import urllib.request
import re

url = 'https://backend.deviantart.com/rss.xml?q=gallery:kittyinhiding+Duel+Links'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        xml = resp.read().decode('utf-8', 'ignore')
        items = re.findall(r'<item>(.*?)</item>', xml, re.DOTALL)
        print("Items:", len(items))
        for it in items:
            title = re.search(r'<title>(.*?)</title>', it)
            link = re.search(r'<link>(.*?)</link>', it)
            desc = re.search(r'<description>(.*?)</description>', it, re.DOTALL)
            t = title.group(1) if title else ""
            l = link.group(1) if link else ""
            d = desc.group(1) if desc else ""
            print(f"TITLE: {t}")
            print(f"LINK: {l}")
            cloud = re.findall(r'https?://[^\s<>"\'&]+(?:drive|mega|mediafire|tinyurl)[^\s<>"\'&]*', d)
            if cloud:
                print("CLOUD:", cloud)
except Exception as e:
    print("Error:", e)
