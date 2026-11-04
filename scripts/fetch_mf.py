import urllib.request
import re

url = 'https://www.deviantart.com/thepharaohsservant/art/Yu-Gi-Oh-Cross-Duel-3D-Models-965038630'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        mf_links = re.findall(r'https?://[^\s\"\'<>]+mediafire[^\s\"\'<>]+', html)
        gd_links = re.findall(r'https?://drive\.google\.com/[^\s\"\'<>]+', html)
        mega_links = re.findall(r'https?://mega\.nz/[^\s\"\'<>]+', html)
        print('Mediafire:', set(mf_links))
        print('GD:', set(gd_links))
        print('Mega:', set(mega_links))
except Exception as e:
    print('Error:', e)
