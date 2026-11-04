import urllib.request, re, os

url = 'https://www.myinstants.com/en/instant/blue-eyes-ultimate-dragon-58851/'
headers = {'User-Agent': 'Mozilla/5.0'}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        m = re.findall(r'/media/sounds/[^\'"]+\.mp3', html)
        if m:
            mp3_url = 'https://www.myinstants.com' + m[0]
            print('Found MP3:', mp3_url)
            dest = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/sfx/blue-eyes-ultimate-dragon.mp3'
            with urllib.request.urlopen(urllib.request.Request(mp3_url, headers=headers)) as r, open(dest, 'wb') as f:
                f.write(r.read())
            print('Saved:', dest, os.path.getsize(dest))
except Exception as e:
    print(e)
