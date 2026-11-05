#!/usr/bin/env python3
"""Playwright smoke: setup → play → questions → end, with screenshots."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/taigi-rail-monopoly/"
OUT = Path("/workspace/taigi-rail-monopoly/shots")
OUT.mkdir(parents=True, exist_ok=True)

SIZES = {
    "desktop": {"width": 1280, "height": 800},
    "tablet": {"width": 1024, "height": 768},
}

def shot(page, name, size_key):
    path = OUT / f"{name}_{size_key}.png"
    page.screenshot(path=str(path), full_page=True)
    print("saved", path)
    return path

def click_if(page, text, timeout=800):
    loc = page.get_by_role("button", name=text)
    try:
        loc.first.wait_for(state="visible", timeout=timeout)
        loc.first.click()
        return True
    except Exception:
        return False

def answer_if_question(page):
    opts = page.locator(".opt-btn")
    if opts.count() == 0:
        return False
    opts.first.click()
    page.wait_for_timeout(200)
    click_if(page, "下一步", 2000)
    return True

def advance(page):
    if answer_if_question(page):
        return "answer"
    if click_if(page, "收好卡片，繼續"):
        return "lore"
    if click_if(page, "繼續"):
        return "ack"
    if click_if(page, "擲骰子"):
        return "roll"
    return None

def run_size(browser, size_key, viewport):
    context = browser.new_context(viewport=viewport, locale="zh-TW")
    page = context.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)

    # Setup: auto-pick differs stations
    page.get_by_role("button", name="自動挑台華語不同的站").click()
    page.wait_for_timeout(300)
    count_txt = page.locator("#sel-count").inner_text()
    print(size_key, "selected", count_txt)
    assert int(count_txt) >= 6, count_txt

    # Save set quickly
    page.fill("input[placeholder='例：第一週・西部幹線']", "測試組合A")
    page.get_by_role("button", name="儲存目前選站").click()
    page.wait_for_timeout(200)
    assert page.get_by_text("測試組合A").count() >= 1

    shot(page, "setup", size_key)

    page.get_by_role("button", name="開始環島").click()
    page.wait_for_selector("text=的回合", timeout=10000)
    page.wait_for_selector("svg.board-svg", timeout=5000)
    shot(page, "board", size_key)

    saw_question = False
    saw_reveal = False
    actions = []
    for i in range(80):
        # capture question dialog
        if page.locator(".opt-btn").count() > 0 and not saw_question:
            shot(page, "question", size_key)
            saw_question = True
            # check diacritics: option text should be non-empty romanization-ish
            sample = page.locator(".opt-btn").first.inner_text()
            print(size_key, "question option sample:", sample)
            assert len(sample) >= 2
        kind = advance(page)
        actions.append(kind)
        page.wait_for_timeout(120)
        if page.locator(".reveal").count() > 0:
            saw_reveal = True
        if page.get_by_text("本局結算").count():
            break
        if saw_question and i > 25:
            # enough play; end
            if click_if(page, "結束遊戲", 500):
                page.wait_for_timeout(400)
                break

    # If still in game, force end
    if page.get_by_text("本局結算").count() == 0:
        click_if(page, "結束遊戲", 2000)
        page.wait_for_timeout(500)

    page.wait_for_selector("text=本局結算", timeout=10000)
    # wrong list section exists
    assert page.get_by_text("答錯地名複習清單").count() >= 1
    shot(page, "end", size_key)

    print(size_key, "actions", {a: actions.count(a) for a in set(actions) if a})
    print(size_key, "saw_question", saw_question, "saw_reveal", saw_reveal)
    assert saw_question, "never saw a buy/rent question"
    context.close()
    return True

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for key, vp in SIZES.items():
            run_size(browser, key, vp)
        browser.close()
    print("ALL OK")

if __name__ == "__main__":
    main()
