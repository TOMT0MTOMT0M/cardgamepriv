import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    url = "https://www.models-resource.com/mobile/yugiohduellinks/"
    print(f"Navigating to {url}...")
    page.goto(url, wait_until="domcontentloaded")
    time.sleep(3)
    print("Page title:", page.title())
    links = page.query_selector_all("a[href*='/model/']")
    print(f"Found {len(links)} model links:")
    for a in links[:15]:
        print(" ", a.inner_text().strip(), "->", a.get_attribute("href"))
    browser.close()
