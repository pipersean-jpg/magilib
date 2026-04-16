"""
scrape-qtte-inventory.py
Scrapes the full QTTE catalog and outputs a CSV ready for upload
to MagiLib Admin → Price Data → Upload CSV.

Output columns match the admin portal's expected format:
  title, author, source, price, currency, url

Usage:
  python scripts/scrape-qtte-inventory.py
  python scripts/scrape-qtte-inventory.py --test   # first 10 items only

Requirements:
  pip install playwright
  playwright install chromium
"""

import csv
import time
import random
import re
import sys
from html import unescape
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# --- CONFIGURATION ---
TEST_MODE = '--test' in sys.argv
TEST_LIMIT = 10
CATEGORY_URL = "https://quickerthantheeye.com/all/books?sort_by=newest"
SOURCE = "qtte_secondary"
CURRENCY = "USD"

current_date = datetime.now().strftime("%Y-%m-%d")
OUTPUT_CSV = f"scripts/QTTE_inventory_{current_date}.csv"

MIN_DELAY = 2.0
MAX_DELAY = 5.0


def extract_via_regex(page):
    try:
        html_content = page.content()
        clean_text = html_content.replace('\n', ' ')
        clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
        clean_text = re.sub(r'\s+', ' ', clean_text)

        stop_words = r'(?:Condition|Description|Pages|Binding|Author|Publisher|Date|Price|\$)'

        author_match    = re.search(r'Author/?\s*Editor?[:\s]+(.*?)\s*(?=' + stop_words + r'|$)', clean_text, re.IGNORECASE)
        pub_match       = re.search(r'Publisher[:\s]+(.*?)\s*(?=' + stop_words + r'|$)', clean_text, re.IGNORECASE)
        date_match      = re.search(r'(?:Date|Published)[:\s]+(.*?)\s*(?=' + stop_words + r'|$)', clean_text, re.IGNORECASE)

        author    = unescape(author_match.group(1).strip().rstrip('.,;')) if author_match else ''
        publisher = unescape(pub_match.group(1).strip().rstrip('.,;'))   if pub_match    else ''
        year      = unescape(date_match.group(1).strip().rstrip('.,;'))  if date_match   else ''

        # Discard publisher fragments (e.g. "The" grabbed mid-sentence)
        if len(publisher) < 4:
            publisher = ''

        return author, publisher, year

    except Exception as e:
        print(f"     [Regex Error] {str(e)}")
        return '', '', ''


def parse_price(raw_price):
    """Strip $ and commas, return float or empty string."""
    try:
        return float(re.sub(r'[^\d.]', '', raw_price))
    except (ValueError, TypeError):
        return ''


def scrape_product_page(page, url):
    print(f"  -> Scraping: {url}")
    page.goto(url, wait_until="domcontentloaded")

    try:
        page.locator("h1").wait_for(timeout=10000)
    except PlaywrightTimeoutError:
        print("     [!] Page failed to load. Skipping.")
        return None

    title = ''
    price_raw = ''

    try:
        title = page.locator("h1").first.inner_text(timeout=5000).strip()
    except Exception:
        pass

    try:
        price_locator = page.locator("[class*='price'], [class*='Price'], span:has-text('$')").first
        price_raw = price_locator.inner_text(timeout=5000).strip()
    except Exception:
        pass

    author, publisher, year = extract_via_regex(page)
    price = parse_price(price_raw)

    if not title or price == '':
        return None

    return {
        'title': title,
        'author': author,
        'publisher': publisher,
        'year': year,
        'source': SOURCE,
        'price': price,
        'currency': CURRENCY,
        'url': url,
    }


def main():
    print(f"Output: {OUTPUT_CSV}")
    if TEST_MODE:
        print(f"*** TEST MODE: first {TEST_LIMIT} items only ***")

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['title', 'author', 'publisher', 'year', 'source', 'price', 'currency', 'url'])
        writer.writeheader()

        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            )
            page = context.new_page()

            current_category_url = CATEGORY_URL
            seen_links = set()
            total_scraped = 0
            current_page_num = 1

            while True:
                print(f"\n=== Page {current_page_num} === {current_category_url}")
                page.goto(current_category_url, wait_until="domcontentloaded")
                page.wait_for_selector("a[href*='/p/']", timeout=15000)

                product_links = page.eval_on_selector_all("a[href*='/p/']", "els => els.map(el => el.href)")
                new_links = [l for l in product_links if l not in seen_links]

                if not new_links:
                    print("No new products — reached end.")
                    break

                print(f"Found {len(new_links)} new products.")

                if TEST_MODE:
                    new_links = new_links[:TEST_LIMIT]

                # Capture next page URL while still on the category page
                next_category_url = None
                parsed_current = urlparse(current_category_url)
                base_domain = f"{parsed_current.scheme}://{parsed_current.netloc}"

                next_button = page.locator("li.next-page a").first
                if next_button.count() > 0:
                    btn_classes = next_button.get_attribute("class") or ""
                    if "disabled" not in btn_classes.lower():
                        next_category_url = next_button.get_attribute("href")

                if not next_category_url:
                    safe_url = current_category_url if current_category_url.startswith("http") else base_domain + current_category_url
                    parsed_url = urlparse(safe_url)
                    params = parse_qs(parsed_url.query)
                    next_p = int(params.get('page', ['1'])[0]) + 1
                    params['page'] = [str(next_p)]
                    next_category_url = urlunparse(parsed_url._replace(query=urlencode(params, doseq=True)))

                if next_category_url and not next_category_url.startswith("http"):
                    next_category_url = base_domain + next_category_url

                for link in new_links:
                    try:
                        data = scrape_product_page(page, link)
                        if data:
                            writer.writerow(data)
                            f.flush()
                            seen_links.add(link)
                            total_scraped += 1
                            print(f"     [{total_scraped}] {data['title']} — ${data['price']}")
                    except Exception as e:
                        print(f"     [ERROR] {str(e)}")

                    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

                if TEST_MODE:
                    break

                if next_category_url == current_category_url:
                    print("Next URL identical to current — last page reached.")
                    break

                current_category_url = next_category_url
                current_page_num += 1

            browser.close()

    print(f"\n=== Done. {total_scraped} items saved to {OUTPUT_CSV} ===")


if __name__ == "__main__":
    main()
