import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    url = "https://www.mediafire.com/file/zryawp2rure8vqd/Cross_Duel_Data.rar/file"
    print(f"Loading {url}...")
    page.goto(url, wait_until="domcontentloaded")
    time.sleep(3)
    # Find download button link
    btn = page.query_selector("#downloadButton")
    if btn:
        print("Download href:", btn.get_attribute("href"))
    else:
        print("Button not found. Title:", page.title())
    browser.close()
