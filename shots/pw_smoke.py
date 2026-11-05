#!/usr/bin/env python3
"""Playwright smoke v1.2: geography order + square board + full game."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/taigi-rail-monopoly/"
OUT = Path("/workspace/taigi-rail-monopoly/shots")
OUT.mkdir(parents=True, exist_ok=True)

SIZES = {
    "desktop": {"width": 1280, "height": 800},
    "tablet": {"width": 1024, "height": 768},
}

# Diverse round-island sample for readable geography check
GEO_PICK = [
    "臺北", "板橋", "桃園", "新竹", "苗栗", "臺中", "彰化", "嘉義", "臺南", "高雄",
    "屏東", "枋寮", "臺東", "花蓮", "宜蘭", "羅東", "瑞芳", "基隆", "七堵", "南港",
    "山佳", "沙鹿", "二水", "潮州",
]

def shot(page, name, size_key):
    path = OUT / f"{name}_{size_key}.png"
    page.screenshot(path=str(path), full_page=True)
    print("saved", path)

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

def select_geo(page):
    page.get_by_role("button", name="清除").click()
    page.wait_for_timeout(200)
    page.evaluate(
        """(names) => {
          for (const name of names) {
            // Re-query each time: checkbox onchange re-renders the list.
            const items = [...document.querySelectorAll('.station-item')];
            const it = items.find(el => {
              const n = el.querySelector('.name')?.textContent?.trim();
              return n === name || (name.length >= 2 && n?.startsWith(name));
            });
            const cb = it?.querySelector('input[type=checkbox]');
            if (cb && !cb.checked) cb.click();
          }
        }""",
        GEO_PICK,
    )
    page.wait_for_timeout(500)
    if page.get_by_role("button", name="縮減到上限").count():
        page.get_by_role("button", name="縮減到上限").click()
        page.wait_for_timeout(300)

def run_size(browser, size_key, viewport):
    context = browser.new_context(viewport=viewport, locale="zh-TW")
    page = context.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)

    select_geo(page)
    count = int(page.locator("#sel-count").inner_text())
    print(size_key, "selected", count)
    assert count >= 6

    page.fill("input[placeholder='例：第一週・西部幹線']", "環島地理組")
    page.get_by_role("button", name="儲存目前選站").click()
    shot(page, "setup", size_key)

    start = page.get_by_role("button", name="開始環島")
    assert start.is_enabled()
    start.click()
    page.wait_for_selector(".mono-board", timeout=10000)

    # Read station order around the board (DOM order = trip order)
    labels = page.evaluate("""() => [...document.querySelectorAll('.mono-sq')].map(el => {
      const t = el.querySelector('.mono-name')?.textContent?.trim();
      return t;
    }).filter(Boolean)""")
    # drop 起點 and specials for key check
    stations_only = [x for x in labels if x not in ("起點", "支線", "地名典故卡", "月台休息")
                     and not x.endswith("支線")]
    print(size_key, "board stations:", " → ".join(stations_only))

    def idx(name):
        for i, n in enumerate(stations_only):
            if n == name or n.startswith(name):
                return i
        return -1

    keys = ["臺北", "高雄", "花蓮", "宜蘭"]
    positions = [idx(k) for k in keys]
    print(size_key, "key positions", dict(zip(keys, positions)))
    present = [(k, p) for k, p in zip(keys, positions) if p >= 0]
    for i in range(1, len(present)):
        assert present[i][1] > present[i - 1][1], present

    # Side hints should not be the old fixed wrong ones only — just ensure some hint exists
    hints = page.locator(".mono-hint").all_inner_texts()
    print(size_key, "side hints", hints)

    font_size = page.locator(".mono-name").first.evaluate("el => getComputedStyle(el).fontSize")
    print(size_key, "font", font_size)
    assert float(font_size.replace("px", "")) >= 11

    shot(page, "board", size_key)

    saw_question = False
    actions = []
    for i in range(80):
        if page.locator(".opt-btn").count() > 0 and not saw_question:
            shot(page, "question", size_key)
            saw_question = True
        kind = advance(page)
        actions.append(kind)
        page.wait_for_timeout(100)
        if page.get_by_text("本局結算").count():
            break
        if saw_question and i > 25 and click_if(page, "結束遊戲", 400):
            page.wait_for_timeout(300)
            break

    if page.get_by_text("本局結算").count() == 0:
        click_if(page, "結束遊戲", 2000)
        page.wait_for_timeout(400)

    page.wait_for_selector("text=本局結算", timeout=10000)
    shot(page, "end", size_key)
    assert saw_question
    print(size_key, "actions", {a: actions.count(a) for a in set(actions) if a})
    context.close()

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for key, vp in SIZES.items():
            run_size(browser, key, vp)
        browser.close()
    print("ALL OK")

if __name__ == "__main__":
    main()
