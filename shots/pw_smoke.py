#!/usr/bin/env python3
"""Playwright smoke v1.3.3: larger squares, no clipped station labels."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/taigi-rail-monopoly/"
OUT = Path("/workspace/taigi-rail-monopoly/shots")
OUT.mkdir(parents=True, exist_ok=True)

SIZES = {
    "1024x768": {"width": 1024, "height": 768},
    "1280x800": {"width": 1280, "height": 800},
    "1366x768": {"width": 1366, "height": 768},
    "1920x1080": {"width": 1920, "height": 1080},
    "ipad_land": {"width": 1180, "height": 820},
    "ipad_port": {"width": 820, "height": 1180},
}

# Default classroom geography set (matches prior smoke)
GEO_PICK = [
    "臺北", "板橋", "桃園", "新竹", "苗栗", "臺中", "彰化", "嘉義", "臺南", "高雄",
    "屏東", "枋寮", "臺東", "花蓮", "宜蘭", "羅東", "瑞芳", "基隆", "七堵", "南港",
    "山佳", "沙鹿", "二水", "潮州",
]

# Stress set: longest Taigi romanizations + a few classics (≤40 after specials)
LONG_PICK = [
    "新城(太魯閣)", "左營(舊城)", "長榮大學", "林榮新光", "蘇澳新站", "臺中港",
    "九曲堂", "石城", "林鳳營", "美術館", "科工館", "九讚頭", "大山", "石榴", "石龜",
    "南樹林", "三姓橋", "白沙屯", "新左營", "三塊厝", "頭家厝", "六塊厝", "三貂嶺",
    "海科館", "三坑", "貢寮", "橫山", "龍泉", "臺北", "高雄", "花蓮", "臺東",
    "宜蘭", "基隆", "彰化", "山佳", "南港", "月美", "富貴(南河)", "木屐寮",
]

TOKEN_LANE = 9
TEAM_COLORS = ["#c75b39", "#3d7a6a", "#4a90a4", "#c4a35a"]

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

def select_stations(page, names):
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
        names,
    )
    page.wait_for_timeout(400)
    if page.get_by_role("button", name="縮減到上限").count():
        page.get_by_role("button", name="縮減到上限").click()
        page.wait_for_timeout(250)

def assert_team_colors(page, selector=".player-row .piece-wrap"):
    result = page.evaluate(
        """({ selector, expected }) => {
          const wraps = [...document.querySelectorAll(selector)].slice(0, 4);
          const info = wraps.map(w => {
            const svg = w.querySelector('svg');
            const stops = [...(svg?.querySelectorAll('linearGradient stop') || [])]
              .map(s => (s.getAttribute('stop-color') || '').toLowerCase());
            const mid = stops.length >= 2 ? stops[1] : stops[0];
            return {
              piece: w.dataset.piece,
              dataColor: (w.dataset.teamColor || svg?.dataset.teamColor || '').toLowerCase(),
              midStop: mid,
              gradId: svg?.querySelector('linearGradient')?.id || null,
            };
          });
          const colors = info.map(i => i.dataColor);
          const mids = info.map(i => i.midStop);
          const gradIds = info.map(i => i.gradId);
          const uniqueColors = new Set(colors);
          const uniqueGrads = new Set(gradIds);
          const expectedSet = new Set(expected.map(c => c.toLowerCase()));
          const allKnown = colors.every(c => expectedSet.has(c)) && mids.every((m, i) => m === colors[i]);
          return {
            ok: uniqueColors.size === 4 && uniqueGrads.size === 4 && allKnown && !gradIds.includes(null),
            info, colors, mids, gradIds,
            uniqueColorCount: uniqueColors.size,
            uniqueGradCount: uniqueGrads.size,
            allKnown,
          };
        }""",
        {"selector": selector, "expected": TEAM_COLORS},
    )
    print("color check", selector, result)
    assert result["ok"], result
    return result

def assert_labels_fit(page):
    """Every .mono-name / .mono-tl must fully fit (body not overflowing; glyphs inside square)."""
    result = page.evaluate(
        """() => {
          const board = document.querySelector('.mono-board');
          if (!board) return { ok: false, error: 'no board' };
          const br = board.getBoundingClientRect();
          function glyphRect(el) {
            try {
              const range = document.createRange();
              range.selectNodeContents(el);
              const rects = [...range.getClientRects()];
              if (!rects.length) return el.getBoundingClientRect();
              let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
              for (const r of rects) {
                if (r.width <= 0 && r.height <= 0) continue;
                left = Math.min(left, r.left); top = Math.min(top, r.top);
                right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
              }
              if (!Number.isFinite(left)) return el.getBoundingClientRect();
              return { left, top, right, bottom };
            } catch (e) { return el.getBoundingClientRect(); }
          }
          const failures = [];
          for (const el of board.querySelectorAll('.mono-name, .mono-tl')) {
            const text = (el.textContent || '').trim();
            if (!text) continue;
            const sq = el.closest('.mono-sq');
            const body = el.closest('.mono-sq-body') || sq;
            const bodyOverflow = body.scrollWidth > body.clientWidth + 2 || body.scrollHeight > body.clientHeight + 2;
            const sr = sq.getBoundingClientRect();
            const gr = glyphRect(el);
            const glyphClip = (
              gr.right > sr.right + 1.5 || gr.bottom > sr.bottom + 1.5 ||
              gr.left < sr.left - 1.5 || gr.top < sr.top - 1.5
            );
            // Also expose scroll metrics for debugging (not used as sole fail)
            const sw = el.scrollWidth, sh = el.scrollHeight, cw = el.clientWidth, ch = el.clientHeight;
            if (bodyOverflow || glyphClip) {
              failures.push({
                text, cls: el.className, bodyOverflow, glyphClip,
                sw, sh, cw, ch,
                side: [...sq.classList].find(c => c.startsWith('side-')),
                sqW: Math.round(sr.width), sqH: Math.round(sr.height),
                font: getComputedStyle(el).fontSize,
              });
            }
          }
          return {
            ok: failures.length === 0,
            failures: failures.slice(0, 25),
            failCount: failures.length,
            board: { w: Math.round(br.width), h: Math.round(br.height) },
            nLabels: board.querySelectorAll('.mono-name, .mono-tl').length,
          };
        }"""
    )
    print("label-fit", result.get("board"), "fails", result.get("failCount"), "n", result.get("nLabels"))
    if not result.get("ok"):
        for f in result.get("failures", [])[:12]:
            print("  FAIL", f)
    assert result.get("ok"), result
    assert result["board"]["w"] >= 520, result
    assert abs(result["board"]["w"] - result["board"]["h"]) <= 3, result
    return result


def assert_no_token_text_overlap(page):
    result = page.evaluate(
        """({ lanePct }) => {
          const board = document.querySelector('.mono-board');
          if (!board) return { ok: false, error: 'no board' };
          const squares = [...board.querySelectorAll('.mono-sq')];
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
          const sources = [...document.querySelectorAll('.player-card .piece-wrap')].slice(0, 4);
          if (sources.length < 4) return { ok: false, error: 'need 4 sources', n: sources.length };

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
          const sizes = [];

          for (const pick of picks) {
            const lane = laneRectFor(pick.el);
            const row = document.createElement('div');
            row.className = `mono-token-lane side-${lane.side} grid-2x2` + (pick.corner ? ' corner' : '');
            row.dataset.testLane = '1';
            row.style.left = lane.left + '%';
            row.style.top = lane.top + '%';
            row.style.width = lane.width + '%';
            row.style.height = lane.height + '%';
            sources.forEach((src) => {
              const clone = src.cloneNode(true);
              clone.classList.add('mono-token-piece');
              const svg = clone.querySelector('svg');
              if (svg) { svg.setAttribute('width', '30'); svg.setAttribute('height', '30'); }
              row.appendChild(clone);
            });
            board.appendChild(row);
            void row.offsetWidth;

            const nameEl = pick.el.querySelector('.mono-name');
            const tlEl = pick.el.querySelector('.mono-tl');
            const textBoxes = [nameEl, tlEl].filter(Boolean).map(el => el.getBoundingClientRect());
            const tokenEls = [...row.querySelectorAll('.mono-token-piece')];
            const tokenBoxes = tokenEls.map(el => el.getBoundingClientRect());
            tokenBoxes.forEach(tb => sizes.push(Math.max(tb.width, tb.height)));

            tokenBoxes.forEach((tb, ti) => {
              textBoxes.forEach((xb, xi) => {
                if (overlaps(tb, xb)) {
                  failures.push({ kind: 'token-text', sq: pick.i, side: lane.side, token: ti, text: xi === 0 ? 'name' : 'tl' });
                }
              });
            });
            for (let i = 0; i < tokenBoxes.length; i++) {
              for (let j = i + 1; j < tokenBoxes.length; j++) {
                const a = tokenBoxes[i], b = tokenBoxes[j];
                const interW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const interH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (interW > 2 && interH > 2) {
                  failures.push({ kind: 'token-token', sq: pick.i, side: lane.side, i, j, interW, interH });
                }
              }
            }
            const badge = pick.el.querySelector('.owner-badge');
            if (badge) {
              const bb = badge.getBoundingClientRect();
              textBoxes.forEach((xb, xi) => {
                if (overlaps(bb, xb)) failures.push({ kind: 'badge-text', sq: pick.i, text: xi === 0 ? 'name' : 'tl' });
              });
            }
            checked.push({ sq: pick.i, side: lane.side, corner: pick.corner, tokens: tokenBoxes.length });
          }
          const minSize = sizes.length ? Math.min(...sizes) : 0;
          return { ok: failures.length === 0 && minSize >= 28, failures, checked, minSize, maxSize: sizes.length ? Math.max(...sizes) : 0 };
        }""",
        {"lanePct": TOKEN_LANE},
    )
    print("overlap check", result)
    assert result.get("ok"), result
    assert {c["side"] for c in result["checked"]} == {0, 1, 2, 3}
    assert any(c["corner"] for c in result["checked"])

def compose_midgame(page, out_name="board_midgame.png"):
    result = page.evaluate(
        """({ lanePct }) => {
          const board = document.querySelector('.mono-board');
          const cards = [...document.querySelectorAll('.player-card')];
          if (!board || cards.length < 4) return { ok: false, error: 'missing board/cards' };
          const teams = cards.slice(0, 4).map((card, i) => {
            const wrap = card.querySelector('.piece-wrap');
            return {
              i,
              name: card.querySelector('h3')?.textContent?.replace(/（.*）/, '').trim() || `p${i}`,
              color: wrap?.dataset.teamColor,
              piece: wrap?.dataset.piece,
              source: wrap,
            };
          });
          if (teams.some(t => !t.source || !t.color)) return { ok: false, error: 'team source' };

          board.querySelectorAll('.mono-token-lane').forEach(n => n.remove());
          board.querySelectorAll('.owner-badge').forEach(n => n.remove());
          board.querySelectorAll('.mono-sq.owned').forEach(el => {
            el.classList.remove('owned');
            el.style.removeProperty('--owner');
          });

          const squares = [...board.querySelectorAll('.mono-sq')];
          const bySide = [[], [], [], []];
          squares.forEach((el, idx) => {
            const side = Number([...el.classList].find(c => c.startsWith('side-')).slice(5));
            bySide[side].push({ el, idx });
          });

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

          function remint(wrap, size) {
            const clone = wrap.cloneNode(true);
            clone.classList.add('mono-token-piece');
            const svg = clone.querySelector('svg');
            if (!svg) return clone;
            svg.setAttribute('width', String(size));
            svg.setAttribute('height', String(size));
            const color = (clone.dataset.teamColor || svg.dataset.teamColor || '#888').toLowerCase();
            const gid = 'shot-grad-' + Math.random().toString(36).slice(2, 9);
            const grad = svg.querySelector('linearGradient');
            if (grad) {
              grad.id = gid;
              const stops = [...grad.querySelectorAll('stop')];
              if (stops[1]) stops[1].setAttribute('stop-color', color);
              else if (stops[0]) stops[0].setAttribute('stop-color', color);
            }
            svg.querySelectorAll('[fill^="url("]').forEach(el => el.setAttribute('fill', `url(#${gid})`));
            clone.style.outline = `3px solid ${color}`;
            clone.style.outlineOffset = '1px';
            clone.style.borderRadius = '10px';
            clone.style.background = 'rgba(255,255,255,.7)';
            return clone;
          }

          for (let s = 0; s < 4; s++) {
            const pick = bySide[s].find(x => !x.el.classList.contains('corner')) || bySide[s][0];
            const lane = laneRectFor(pick.el);
            const row = document.createElement('div');
            row.className = `mono-token-lane side-${lane.side}`;
            row.dataset.compose = '1';
            row.style.left = lane.left + '%';
            row.style.top = lane.top + '%';
            row.style.width = lane.width + '%';
            row.style.height = lane.height + '%';
            row.appendChild(remint(teams[s].source, 38));
            board.appendChild(row);
          }

          const stationSq = squares.filter(el => el.querySelector('.mono-tl'));
          const sideOf = el => Number([...el.classList].find(c => c.startsWith('side-')).slice(5));
          const picksOwned = [];
          for (let s = 0; s < 4; s++) {
            const c = stationSq.filter(el => sideOf(el) === s);
            if (c.length) picksOwned.push(c[Math.floor(c.length / 2)]);
          }
          const leftSq = stationSq.filter(el => sideOf(el) === 0);
          if (leftSq[1]) picksOwned.push(leftSq[1]);
          for (let i = 0; i < picksOwned.length; i++) {
            const el = picksOwned[i];
            if (!el) continue;
            const team = teams[i % 4];
            el.classList.add('owned');
            el.style.setProperty('--owner', team.color);
            const strip = el.querySelector('.mono-strip');
            if (strip) {
              strip.querySelectorAll('.owner-badge').forEach(n => n.remove());
              const badge = remint(team.source, 20);
              badge.classList.remove('mono-token-piece');
              badge.classList.add('owner-badge');
              strip.appendChild(badge);
            }
          }

          const tokenColors = [...board.querySelectorAll('.mono-token-lane .piece-wrap')]
            .map(w => w.dataset.teamColor);
          const badgeColors = [...board.querySelectorAll('.owner-badge')]
            .map(w => w.dataset.teamColor);
          const tokenH = [...board.querySelectorAll('.mono-token-lane .piece-svg')]
            .map(s => s.getBoundingClientRect().height);

          const ov = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          const texts = [...board.querySelectorAll('.mono-name, .mono-tl')].map(e => e.getBoundingClientRect());
          const badgeHits = [];
          board.querySelectorAll('.owner-badge').forEach((b, bi) => {
            const bb = b.getBoundingClientRect();
            texts.forEach((t, ti) => { if (ov(bb, t)) badgeHits.push({ bi, ti }); });
          });
          return {
            badgeHits,
            ok: badgeHits.length === 0 && new Set(tokenColors).size === 4 && new Set(badgeColors).size >= 3 && tokenH.every(h => h >= 30),
            tokenColors, badgeColors, tokenH,
            board: { w: Math.round(board.getBoundingClientRect().width), h: Math.round(board.getBoundingClientRect().height) },
          };
        }""",
        {"lanePct": TOKEN_LANE},
    )
    print("compose midgame", result)
    assert result.get("ok"), result
    page.locator(".mono-board").screenshot(path=str(OUT / out_name))
    print("saved", OUT / out_name)

def start_game(page, names):
    select_stations(page, names)
    page.get_by_role("button", name="開始環島").click()
    page.wait_for_selector(".mono-board", timeout=10000)
    page.wait_for_timeout(200)
    page.evaluate("() => window.dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(350)  # fitBoard + ensureLabelsFit rAFs

def run_label_matrix(browser):
    """Label-fit across required viewports for GEO + LONG sets."""
    for set_name, names in (("geo", GEO_PICK), ("long", LONG_PICK)):
        for size_key, viewport in SIZES.items():
            ctx = browser.new_context(viewport=viewport, locale="zh-TW")
            page = ctx.new_page()
            page.on("dialog", lambda d: d.accept())
            page.goto(BASE, wait_until="networkidle", timeout=60000)
            page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)
            start_game(page, names)
            print(f"--- labels {set_name} @ {size_key} ---")
            assert_labels_fit(page)
            ctx.close()

def run_flow(browser):
    # tablet 1024x768: tokens + overlap + midgame shot + standard shots
    ctx = browser.new_context(viewport=SIZES["1024x768"], locale="zh-TW")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)

    select_stations(page, GEO_PICK)
    assert_team_colors(page, ".player-row .piece-wrap")

    page.fill("input[placeholder='例：第一週・西部幹線']", "環島地理組")
    page.get_by_role("button", name="儲存目前選站").click()
    shot(page, "setup", "tablet")

    page.get_by_role("button", name="開始環島").click()
    page.wait_for_selector(".mono-board", timeout=10000)
    page.wait_for_timeout(350)
    assert_team_colors(page, ".player-card .piece-wrap")
    assert_labels_fit(page)
    assert_no_token_text_overlap(page)
    page.evaluate("() => document.querySelectorAll('.mono-token-lane[data-test-lane]').forEach(n => n.remove())")

    # restart clean for midgame compose
    page.get_by_role("button", name="回選站畫面").click()
    page.wait_for_timeout(300)
    start_game(page, GEO_PICK)
    compose_midgame(page, "board_midgame.png")

    page.get_by_role("button", name="回選站畫面").click()
    page.wait_for_timeout(300)
    start_game(page, GEO_PICK)
    shot(page, "board", "tablet")

    saw_question = False
    actions = []
    for i in range(90):
        if page.locator(".opt-btn").count() > 0 and not saw_question:
            shot(page, "question", "tablet")
            saw_question = True
        kind = advance(page)
        actions.append(kind)
        page.wait_for_timeout(60)
        if page.get_by_text("本局結算").count():
            break
        if saw_question and i > 28 and click_if(page, "結束遊戲", 400):
            page.wait_for_timeout(400)
            break
    if page.get_by_text("本局結算").count() == 0:
        click_if(page, "結束遊戲", 2000)
        page.wait_for_timeout(400)
    page.wait_for_selector("text=本局結算", timeout=10000)
    assert_team_colors(page, ".end-rank .piece-wrap")
    shot(page, "end", "tablet")
    assert saw_question
    print("tablet actions", {a: actions.count(a) for a in set(actions) if a})
    ctx.close()

    # 1366 midgame + desktop overlap
    ctx = browser.new_context(viewport=SIZES["1366x768"], locale="zh-TW")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    start_game(page, GEO_PICK)
    assert_labels_fit(page)
    compose_midgame(page, "board_1366.png")
    assert_no_token_text_overlap(page)
    shot(page, "board", "desktop")
    ctx.close()

    # also keep board_desktop naming from 1280
    ctx = browser.new_context(viewport=SIZES["1280x800"], locale="zh-TW")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    start_game(page, GEO_PICK)
    assert_labels_fit(page)
    assert_no_token_text_overlap(page)
    shot(page, "board", "1280")
    ctx.close()

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        run_label_matrix(browser)
        run_flow(browser)
        browser.close()
    print("ALL OK")

if __name__ == "__main__":
    main()
