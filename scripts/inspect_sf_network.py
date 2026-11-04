import time
from playwright.sync_api import sync_playwright

requests = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("request", lambda req: requests.append(req.url))
    url = "https://sketchfab.com/3d-models/obelisk-the-tormentor-5d80dcef568e4aed98ee158a3c29a6f0"
    print(f"Loading {url}...")
    page.goto(url, wait_until="networkidle")
    time.sleep(5)
    
    print(f"Total requests: {len(requests)}")
    bin_urls = [u for u in requests if any(x in u for x in ['.bin', '.osgjs', '.gltf', '.glb', 'model_file', 'textures'])]
    print("Interesting model asset URLs:")
    for u in bin_urls:
        print(" ", u)
    browser.close()
