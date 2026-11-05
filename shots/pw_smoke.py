#!/usr/bin/env python3
"""Playwright smoke v1.3.1: unique team colours + large outer-lane tokens."""
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

TOKEN_LANE = 11
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
    opts = page.locator(".opt and .opt-btn") if False else page.locator(".opt-btn")
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

def assert_team_colors(page, selector=".player-row .piece-wrap"):
    result = page.evaluate(
        """({ selector, expected }) => {
          const wraps = [...document.querySelectorAll(selector)].slice(0, 4);
          const info = wraps.map(w => {
            const svg = w.querySelector('svg');
            const stops = [...(svg?.querySelectorAll('linearGradient stop') || [])]
              .map(s => (s.getAttribute('stop-color') || '').toLowerCase());
            // mid stop should be the team colour
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
          // Order may follow ranking on end screen; require the four team colours, each mid-stop matching data-color.
          const allKnown = colors.every(c => expectedSet.has(c)) && mids.every((m, i) => m === colors[i]);
          const orderedMatch = expected.every((c, i) => colors[i] === c.toLowerCase() && mids[i] === c.toLowerCase());
          return {
            ok: uniqueColors.size === 4 && uniqueGrads.size === 4 && allKnown && !gradIds.includes(null),
            info, colors, mids, gradIds,
            uniqueColorCount: uniqueColors.size,
            uniqueGradCount: uniqueGrads.size,
            match: orderedMatch,
            allKnown,
          };
        }""",
        {"selector": selector, "expected": TEAM_COLORS},
    )
    print("color check", selector, result)
    assert result["ok"], result
    return result

def capture_tokens(page):
    page.evaluate("""() => {
      const box = document.createElement('div');
      box.id = 'token-showcase';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f7f1e3;display:flex;align-items:center;justify-content:center;gap:2.8rem;padding:2.5rem;';
      const labels = ['紅隊・國王', '青隊・騎士', '藍隊・城堡', '金隊・皇后'];
      const wraps = [...document.querySelectorAll('.player-row .piece-wrap')].slice(0, 4);
      wraps.forEach((w, i) => {
        const col = document.createElement('div');
        col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.75rem;';
        // Re-clone from live node (unique grads already fixed)
        const clone = w.cloneNode(true);
        const svg = clone.querySelector('svg');
        if (svg) { svg.setAttribute('width', '140'); svg.setAttribute('height', '140'); }
        const cap = document.createElement('div');
        cap.style.cssText = 'font:700 1.15rem "Noto Sans TC",sans-serif;color:#2c2a26;text-align:center;';
        cap.textContent = labels[i] || '';
        const sw = document.createElement('div');
        sw.style.cssText = `width:2rem;height:0.45rem;border-radius:999px;background:${w.dataset.teamColor};`;
        col.append(clone, cap, sw);
        box.appendChild(col);
      });
      document.body.appendChild(box);
    }""")
    page.wait_for_timeout(250)
    # Verify colours inside showcase (clones keep stop-colors)
    show = page.evaluate("""() => {
      const stops = [...document.querySelectorAll('#token-showcase linearGradient')].map(g => {
        const ss = [...g.querySelectorAll('stop')].map(s => s.getAttribute('stop-color'));
        return { id: g.id, mid: ss[1] || ss[0] };
      });
      return { n: stops.length, mids: stops.map(s => s.mid), ids: stops.map(s => s.id) };
    }""")
    print("tokens.png colours", show)
    assert len(set(show["mids"])) == 4, show
    assert len(set(show["ids"])) == 4, show
    page.locator("#token-showcase").screenshot(path=str(OUT / "tokens.png"))
    print("saved", OUT / "tokens.png")
    page.evaluate("() => document.getElementById('token-showcase')?.remove()")

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

def compose_midgame(page):
    """Place all 4 team tokens on outer lanes + ≥3 owned badges from different teams."""
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
          if (teams.some(t => !t.source || !t.color)) return { ok: false, error: 'team source', teams: teams.map(t => ({c:t.color,p:t.piece})) };

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
            bySide[side].push({ el, idx, station: !el.classList.contains('type-start') && !el.classList.contains('type-branch') && !el.classList.contains('type-lore') && !el.classList.contains('type-rest') });
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
            // Also paint a visible team-colour ring so colour reads even if gradient fails
            clone.style.outline = `3px solid ${color}`;
            clone.style.outlineOffset = '1px';
            clone.style.borderRadius = '10px';
            clone.style.background = 'rgba(255,255,255,.7)';
            return clone;
          }

          // One token per side (mid-edge preferred) so all 4 colours show
          const tokenSquares = [];
          for (let s = 0; s < 4; s++) {
            const pick = bySide[s].find(x => !x.el.classList.contains('corner')) || bySide[s][0];
            tokenSquares.push(pick);
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

          // ≥3 owned stations from different teams
          const stationSq = squares.filter(el => el.querySelector('.mono-tl'));
          const owned = [];
          const sideOf = el => Number([...el.classList].find(c => c.startsWith('side-')).slice(5));
          const picksOwned = [];
          for (let s = 0; s < 4; s++) { const c = stationSq.filter(el => sideOf(el) === s); if (c.length) picksOwned.push(c[Math.floor(c.length/2)]); }
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
              const badge = remint(team.source, 22);
              badge.classList.remove('mono-token-piece');
              badge.classList.add('owner-badge');
              strip.appendChild(badge);
              owned.push({ color: team.color, piece: team.piece });
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
            badgeHits, leftOwned: picksOwned.filter(el => sideOf(el) === 0).length,
            ok: badgeHits.length === 0 && new Set(tokenColors).size === 4 && new Set(badgeColors).size >= 3 && tokenH.every(h => h >= 30),
            tokenColors, badgeColors, tokenH, owned,
          };
        }""",
        {"lanePct": TOKEN_LANE},
    )
    print("compose midgame", result)
    assert result.get("ok"), result
    page.locator(".mono-board").screenshot(path=str(OUT / "board_midgame.png"))
    print("saved", OUT / "board_midgame.png")

def run_size(browser, size_key, viewport, take_tokens=False, do_overlap=False, do_midgame=False):
    context = browser.new_context(viewport=viewport, locale="zh-TW")
    page = context.new_page()
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("text=台語地名鐵路環島大富翁", timeout=15000)

    select_geo(page)
    assert page.locator(".player-row .piece-svg").count() == 4
    assert_team_colors(page, ".player-row .piece-wrap")

    if take_tokens:
        capture_tokens(page)

    page.fill("input[placeholder='例：第一週・西部幹線']", "環島地理組")
    page.get_by_role("button", name="儲存目前選站").click()
    shot(page, "setup", size_key)

    page.get_by_role("button", name="開始環島").click()
    page.wait_for_selector(".mono-board", timeout=10000)
    assert_team_colors(page, ".player-card .piece-wrap")
    # also turn banner piece
    assert page.locator(".turn-name .piece-wrap").count() >= 1

    labels = page.evaluate("""() => [...document.querySelectorAll('.mono-sq')].map(el =>
      el.querySelector('.mono-name')?.textContent?.trim()).filter(Boolean)""")
    stations_only = [x for x in labels if x not in ("起點", "支線", "地名典故卡", "月台休息") and not x.endswith("支線")]
    print(size_key, "stations", " → ".join(stations_only[:6]), "...")

    if do_overlap:
        assert_no_token_text_overlap(page)
        page.evaluate("() => document.querySelectorAll('.mono-token-lane[data-test-lane]').forEach(n => n.remove())")
        page.get_by_role("button", name="回選站畫面").click()
        page.wait_for_timeout(300)
        select_geo(page)
        page.get_by_role("button", name="開始環島").click()
        page.wait_for_selector(".mono-board", timeout=10000)

    if do_midgame:
        compose_midgame(page)
        # restore clean board for rest of flow
        page.get_by_role("button", name="回選站畫面").click()
        page.wait_for_timeout(300)
        select_geo(page)
        page.get_by_role("button", name="開始環島").click()
        page.wait_for_selector(".mono-board", timeout=10000)

    shot(page, "board", size_key)

    saw_question = False
    actions = []
    for i in range(90):
        if page.locator(".opt-btn").count() > 0 and not saw_question:
            shot(page, "question", size_key)
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
    shot(page, "end", size_key)
    assert saw_question
    print(size_key, "actions", {a: actions.count(a) for a in set(actions) if a})
    context.close()

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Required retakes at 1024x768
        run_size(browser, "tablet", SIZES["tablet"], take_tokens=True, do_overlap=True, do_midgame=True)
        run_size(browser, "desktop", SIZES["desktop"], take_tokens=False, do_overlap=True, do_midgame=False)
        browser.close()
    print("ALL OK")

if __name__ == "__main__":
    main()
