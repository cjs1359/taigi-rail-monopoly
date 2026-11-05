#!/usr/bin/env python3
"""Playwright smoke v1.3: outer token lane + no text overlap + full game."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/taigi-rail-monopoly/"
OUT = Path("/workspace/taigi-rail-monopoly/shots")
OUT.mkdir(parents=True, exist_ok=True)

SIZES = {
    "desktop": {"width": 1280, "height": 800},
    "tablet": {"width": 1024, "height": 768},
}

GEO_PICK = [
    "臺北", "板橋", "桃園", "新竹", "苗栗", "臺中", "彰化", "嘉義", "臺南", "高雄",
    "屏東", "枋寮", "臺東", "花蓮", "宜蘭", "羅東", "瑞芳", "基隆", "七堵", "南港",
    "山佳", "沙鹿", "二水", "潮州",
]

TOKEN_LANE = 6.2
SQUARE_TRACK = 14.8

def shot(page, name, size_key=None):
    path = OUT / (f"{name}_{size_key}.png" if size_key else f"{name}.png")
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
    page.wait_for_timeout(250)
    click_if(page, "下一步", 3000)
    page.wait_for_timeout(150)
    return True

def advance(page):
    if answer_if_question(page):
        return "answer"
    if click_if(page, "收好卡片，繼續"):
        page.wait_for_timeout(200)
        return "lore"
    if click_if(page, "繼續"):
        page.wait_for_timeout(200)
        return "ack"
    if click_if(page, "擲骰子"):
        page.wait_for_timeout(1400)
        return "roll"
    return None

def select_geo(page):
    page.get_by_role("button", name="清除").click()
    page.wait_for_timeout(200)
    page.evaluate(
        """(names) => {
          for (const name of names) {
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

def capture_tokens(page):
    page.evaluate("""() => {
      const box = document.createElement('div');
      box.id = 'token-showcase';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f7f1e3;display:flex;align-items:center;justify-content:center;gap:2.5rem;padding:2rem;';
      const labels = ['紅隊・國王', '青隊・騎士', '藍隊・城堡', '金隊・皇后'];
      const wraps = [...document.querySelectorAll('.player-row .piece-wrap')].slice(0, 4);
      wraps.forEach((w, i) => {
        const col = document.createElement('div');
        col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.6rem;';
        const clone = w.cloneNode(true);
        const svg = clone.querySelector('svg');
        if (svg) { svg.setAttribute('width', '120'); svg.setAttribute('height', '120'); }
        const cap = document.createElement('div');
        cap.style.cssText = 'font:700 1.1rem sans-serif;color:#2c2a26;';
        cap.textContent = labels[i] || '';
        col.append(clone, cap);
        box.appendChild(col);
      });
      document.body.appendChild(box);
    }""")
    page.wait_for_timeout(200)
    page.locator("#token-showcase").screenshot(path=str(OUT / "tokens.png"))
    print("saved", OUT / "tokens.png")
    page.evaluate("() => document.getElementById('token-showcase')?.remove()")

def assert_no_token_text_overlap(page):
    """Plant 4 tokens on representative squares (all sides + corners) and assert no text overlap."""
    result = page.evaluate(
        """({ lanePct }) => {
          const board = document.querySelector('.mono-board');
          if (!board) return { ok: false, error: 'no board' };
          const squares = [...board.querySelectorAll('.mono-sq')];
          if (squares.length < 8) return { ok: false, error: 'too few squares' };

          // Pick one square per side (prefer non-corner mid when possible) + all 4 corners
          const bySide = [[], [], [], []];
          squares.forEach((el, i) => {
            const side = [...el.classList].find(c => c.startsWith('side-'));
            const s = side ? Number(side.slice(5)) : 0;
            bySide[s].push({ el, i, corner: el.classList.contains('corner') });
          });
          const picks = [];
          for (let s = 0; s < 4; s++) {
            const corner = bySide[s].find(x => x.corner);
            const mid = bySide[s].find(x => !x.corner) || bySide[s][Math.floor(bySide[s].length / 2)];
            if (corner) picks.push(corner);
            if (mid && mid !== corner) picks.push(mid);
          }

          // Source SVGs from sidebar player cards
          const sources = [...document.querySelectorAll('.player-card .piece-wrap')].slice(0, 4);
          if (sources.length < 4) {
            // fallback: turn banner / any
            const any = [...document.querySelectorAll('.piece-wrap')].slice(0, 4);
            while (sources.length < 4 && any[sources.length]) sources.push(any[sources.length]);
          }
          if (sources.length < 4) return { ok: false, error: 'need 4 piece sources', n: sources.length };

          // Clear live lanes so we control placement
          board.querySelectorAll('.mono-token-lane').forEach(n => n.remove());

          function laneRectFor(sqEl) {
            const side = Number([...sqEl.classList].find(c => c.startsWith('side-')).slice(5));
            const left = parseFloat(sqEl.style.left);
            const top = parseFloat(sqEl.style.top);
            const width = parseFloat(sqEl.style.width);
            const height = parseFloat(sqEl.style.height);
            if (side === 0) return { left: 0, top, width: lanePct, height, side };
            if (side === 1) return { left, top: 0, width, height: lanePct, side };
            if (side === 2) return { left: 100 - lanePct, top, width: lanePct, height, side };
            return { left, top: 100 - lanePct, width, height: lanePct, side };
          }

          function overlaps(a, b) {
            return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          }

          const failures = [];
          const checked = [];

          for (const pick of picks) {
            const lane = laneRectFor(pick.el);
            const row = document.createElement('div');
            row.className = `mono-token-lane side-${lane.side}` + (pick.corner ? ' corner' : '');
            row.dataset.testLane = '1';
            row.style.left = lane.left + '%';
            row.style.top = lane.top + '%';
            row.style.width = lane.width + '%';
            row.style.height = lane.height + '%';
            sources.forEach((src) => {
              const clone = src.cloneNode(true);
              clone.classList.add('mono-token-piece');
              const svg = clone.querySelector('svg');
              if (svg) { svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); }
              row.appendChild(clone);
            });
            board.appendChild(row);

            // force layout
            void row.offsetWidth;

            const nameEl = pick.el.querySelector('.mono-name');
            const tlEl = pick.el.querySelector('.mono-tl');
            const textBoxes = [nameEl, tlEl].filter(Boolean).map(el => el.getBoundingClientRect());
            const tokenBoxes = [...row.querySelectorAll('.mono-token-piece')].map(el => el.getBoundingClientRect());

            // tokens vs text
            tokenBoxes.forEach((tb, ti) => {
              textBoxes.forEach((xb, xi) => {
                if (overlaps(tb, xb)) {
                  failures.push({
                    kind: 'token-text',
                    sq: pick.i,
                    side: lane.side,
                    corner: pick.corner,
                    token: ti,
                    text: xi === 0 ? 'name' : 'tl',
                    tb: { l: tb.left, t: tb.top, r: tb.right, b: tb.bottom },
                    xb: { l: xb.left, t: xb.top, r: xb.right, b: xb.bottom },
                  });
                }
              });
            });

            // tokens vs each other (allow 1px touch, not substantial overlap)
            for (let i = 0; i < tokenBoxes.length; i++) {
              for (let j = i + 1; j < tokenBoxes.length; j++) {
                const a = tokenBoxes[i], b = tokenBoxes[j];
                const interW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const interH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (interW > 2 && interH > 2) {
                  failures.push({
                    kind: 'token-token',
                    sq: pick.i, side: lane.side, i, j,
                    interW, interH,
                  });
                }
              }
            }

            // owner badge vs text (if present)
            const badge = pick.el.querySelector('.owner-badge');
            if (badge) {
              const bb = badge.getBoundingClientRect();
              textBoxes.forEach((xb, xi) => {
                if (overlaps(bb, xb)) {
                  failures.push({
                    kind: 'badge-text',
                    sq: pick.i,
                    text: xi === 0 ? 'name' : 'tl',
                  });
                }
              });
            }

            checked.push({ sq: pick.i, side: lane.side, corner: pick.corner, tokens: tokenBoxes.length });
          }

          return { ok: failures.length === 0, failures, checked };
        }""",
        {"lanePct": TOKEN_LANE},
    )
    print("overlap check", result)
    assert result.get("ok"), result
    sides = {c["side"] for c in result["checked"]}
    assert sides == {0, 1, 2, 3}, sides
    assert any(c["corner"] for c in result["checked"])
    assert all(c["tokens"] == 4 for c in result["checked"])

def run_size(browser, size_key, viewport, take_tokens=False, do_overlap=False):
    context = browser.new_context(viewport=viewport, locale="zh-TW")
    page = context.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)

    select_geo(page)
    count = int(page.locator("#sel-count").inner_text())
    print(size_key, "selected", count)
    assert count >= 6

    pieces = page.locator(".player-row .piece-svg")
    assert pieces.count() == 4, pieces.count()
    piece_ids = page.evaluate("() => [...document.querySelectorAll('.player-row .piece-wrap')].map(e => e.dataset.piece)")
    print(size_key, "setup pieces", piece_ids)
    assert piece_ids == ["king", "knight", "rook", "queen"]
    assert page.locator(".audio-mute").count() >= 1

    if take_tokens:
        capture_tokens(page)

    page.fill("input[placeholder='例：第一週・西部幹線']", "環島地理組")
    page.get_by_role("button", name="儲存目前選站").click()
    shot(page, "setup", size_key)

    start = page.get_by_role("button", name="開始環島")
    assert start.is_enabled()
    start.click()
    page.wait_for_selector(".mono-board", timeout=10000)
    page.wait_for_selector(".piece-svg", timeout=5000)

    # At start all 4 are on 起點 — must use outer lane, not inside square body
    start_lanes = page.locator(".mono-token-lane").count()
    print(size_key, "start token lanes", start_lanes)
    assert start_lanes >= 1
    # Tokens should not be descendants of .mono-sq-body
    inside = page.evaluate("() => document.querySelectorAll('.mono-sq-body .mono-token-piece').length")
    assert inside == 0, inside

    labels = page.evaluate("""() => [...document.querySelectorAll('.mono-sq')].map(el => {
      const t = el.querySelector('.mono-name')?.textContent?.trim();
      return t;
    }).filter(Boolean)""")
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

    font_size = page.locator(".mono-name").first.evaluate("el => getComputedStyle(el).fontSize")
    print(size_key, "font", font_size)
    assert float(font_size.replace("px", "")) >= 11

    if do_overlap:
        assert_no_token_text_overlap(page)
        # restore board view by rolling once would be messy; just reload paint via dice no-op —
        # re-click isn't available; force a trivial re-render by toggling nothing.
        # Re-enter from a soft paint: click nothing, but remove test lanes and put start tokens back
        # by triggering a roll path later. For screenshots, navigate continue from current DOM
        # without test lanes — remove them:
        page.evaluate("() => document.querySelectorAll('.mono-token-lane[data-test-lane]').forEach(n => n.remove())")
        # Re-show start tokens: simplest is to reload game quickly
        page.get_by_role("button", name="回選站畫面").click()
        page.wait_for_timeout(300)
        # re-select and start again for remaining flow
        select_geo(page)
        page.get_by_role("button", name="開始環島").click()
        page.wait_for_selector(".mono-board", timeout=10000)

    shot(page, "board", size_key)

    saw_question = False
    mid_saved = False
    actions = []
    for i in range(100):
        if page.locator(".opt-btn").count() > 0 and not saw_question:
            shot(page, "question", size_key)
            saw_question = True
        kind = advance(page)
        actions.append(kind)
        page.wait_for_timeout(80)

        if (not mid_saved and size_key == "desktop" and i >= 8
                and page.locator(".owner-badge").count() >= 1
                and page.locator(".mono-token-piece").count() >= 1
                and page.locator(".opt-btn").count() == 0
                and page.get_by_text("本局結算").count() == 0):
            page.locator(".mono-board").screenshot(path=str(OUT / "board_midgame.png"))
            print("saved", OUT / "board_midgame.png")
            mid_saved = True

        if page.get_by_text("本局結算").count():
            break
        if saw_question and i > 30 and click_if(page, "結束遊戲", 400):
            page.wait_for_timeout(400)
            break

    if page.get_by_text("本局結算").count() == 0:
        click_if(page, "結束遊戲", 2000)
        page.wait_for_timeout(500)

    page.wait_for_selector("text=本局結算", timeout=10000)
    assert page.locator(".end-rank .piece-svg").count() >= 2
    shot(page, "end", size_key)
    assert saw_question
    if size_key == "desktop" and not mid_saved:
        print("WARN: midgame shot skipped (no owned stations yet)")
    print(size_key, "actions", {a: actions.count(a) for a in set(actions) if a})
    context.close()

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Overlap at tablet 1024x768 (strict) and desktop
        run_size(browser, "desktop", SIZES["desktop"], take_tokens=True, do_overlap=True)
        run_size(browser, "tablet", SIZES["tablet"], take_tokens=False, do_overlap=True)
        browser.close()
    print("ALL OK")

if __name__ == "__main__":
    main()
