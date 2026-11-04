import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    url = "https://sketchfab.com/3d-models/obelisk-the-tormentor-5d80dcef568e4aed98ee158a3c29a6f0"
    print(f"Navigating to {url}...")
    page.goto(url, wait_until="domcontentloaded")
    time.sleep(3)
    print("Page title:", page.title())
    # Look for download button or links
    btn = page.query_selector("button:has-text('Download 3D Model'), a:has-text('Download 3D Model')")
    if btn:
        print("Found Download Button:", btn.inner_text())
    browser.close()
