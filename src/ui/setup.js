import { LINE_COLORS } from '../engine/board.js';
import { loadSets, upsertSet, deleteSet } from './storage.js';

const PLAYER_COLORS = ['#c75b39', '#3d7a6a', '#4a90a4', '#c4a35a'];
const DEFAULT_NAMES = ['紅隊', '青隊', '藍隊', '金隊'];

function lineOrderList(stations) {
  const preferred = [
    '縱貫線(北段)', '海岸線', '臺中線', '縱貫線(南段)', '屏東線', '南迴線',
    '臺東線', '北迴線', '宜蘭線', '深澳/平溪線', '內灣/六家線', '集集線',
    '沙崙線', '林務局・阿里山森林鐵路', '林務局・烏來台車', '林務局・蹦蹦車',
    '臺灣糖業', '預定新站及裁撤站',
  ];
  const lines = [...new Set(stations.map(s => s.line))];
  return [
    ...preferred.filter(l => lines.includes(l)),
    ...lines.filter(l => !preferred.includes(l)),
  ];
}

export function renderSetup(root, { stations, onStart }) {
  const state = {
    selected: new Set(),
    playerCount: 4,
    players: DEFAULT_NAMES.map((name, i) => ({ name, color: PLAYER_COLORS[i] })),
    timeLimitMin: 25,
    readAloud: true,
    randomN: 24,
    setName: '',
  };

  const el = document.createElement('div');
  el.className = 'screen setup-screen';
  root.replaceChildren(el);

  function sync() {
    el.innerHTML = '';
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <div>
        <h1>台語地名鐵路環島大富翁</h1>
        <p class="sub">老師先選車站，再讓 2–4 人輪流共用這台裝置遊玩。</p>
        <p class="notice-phone">建議使用平板或電腦開啟</p>
      </div>
      <div class="stat-pill">已選 <strong id="sel-count">${state.selected.size}</strong> 站（建議 16–32）</div>
    `;
    el.appendChild(hero);

    const grid = document.createElement('div');
    grid.className = 'setup-grid';
    el.appendChild(grid);

    // side
    const side = document.createElement('div');
    side.className = 'setup-side';
    grid.appendChild(side);

    const playersCard = document.createElement('div');
    playersCard.className = 'card';
    playersCard.innerHTML = `<strong>玩家設定</strong>`;
    const countField = document.createElement('div');
    countField.className = 'field';
    countField.innerHTML = `<label>人數</label>`;
    const countSel = document.createElement('select');
    for (const n of [2, 3, 4]) {
      const o = document.createElement('option');
      o.value = n; o.textContent = `${n} 人`;
      if (n === state.playerCount) o.selected = true;
      countSel.appendChild(o);
    }
    countSel.onchange = () => {
      state.playerCount = Number(countSel.value);
      sync();
    };
    countField.appendChild(countSel);
    playersCard.appendChild(countField);

    for (let i = 0; i < state.playerCount; i++) {
      const row = document.createElement('div');
      row.className = 'player-row';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = state.players[i].color;
      const input = document.createElement('input');
      input.value = state.players[i].name;
      input.placeholder = `玩家 ${i + 1}`;
      input.oninput = () => { state.players[i].name = input.value; };
      row.append(sw, input);
      playersCard.appendChild(row);
    }

    const timeField = document.createElement('div');
    timeField.className = 'field';
    timeField.innerHTML = `<label>時間限制（分鐘，0＝不限）</label>`;
    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.min = 0; timeInput.max = 120;
    timeInput.value = state.timeLimitMin;
    timeInput.oninput = () => { state.timeLimitMin = Math.max(0, Number(timeInput.value) || 0); };
    timeField.appendChild(timeInput);
    playersCard.appendChild(timeField);

    const readLabel = document.createElement('label');
    readLabel.style.display = 'flex';
    readLabel.style.gap = '0.4rem';
    readLabel.style.alignItems = 'center';
    readLabel.style.margin = '0.4rem 0 0.7rem';
    const readCb = document.createElement('input');
    readCb.type = 'checkbox';
    readCb.checked = state.readAloud;
    readCb.onchange = () => { state.readAloud = readCb.checked; };
    readLabel.append(readCb, document.createTextNode('開啟「大家一起唸」'));
    playersCard.appendChild(readLabel);

    const startBtn = document.createElement('button');
    startBtn.textContent = '開始環島';
    startBtn.onclick = () => {
      if (state.selected.size < 6) {
        alert('請至少選 6 個車站（建議 16–32）。');
        return;
      }
      const players = state.players.slice(0, state.playerCount).map((p, i) => ({
        id: `p${i + 1}`,
        name: (p.name || DEFAULT_NAMES[i]).trim(),
        color: p.color,
      }));
      onStart({
        selectedIds: [...state.selected],
        players,
        timeLimitMin: state.timeLimitMin,
        readAloud: state.readAloud,
      });
    };
    playersCard.appendChild(startBtn);
    side.appendChild(playersCard);

    // save/load
    const saveCard = document.createElement('div');
    saveCard.className = 'card';
    saveCard.innerHTML = `<strong>車站組合</strong>
      <p class="hint">存進這台裝置的瀏覽器，下次可直接載入。</p>`;
    const nameField = document.createElement('div');
    nameField.className = 'field';
    nameField.innerHTML = `<label>組合名稱</label>`;
    const nameInput = document.createElement('input');
    nameInput.placeholder = '例：第一週・西部幹線';
    nameInput.value = state.setName;
    nameInput.oninput = () => { state.setName = nameInput.value; };
    nameField.appendChild(nameInput);
    saveCard.appendChild(nameField);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'secondary';
    saveBtn.textContent = '儲存目前選站';
    saveBtn.onclick = () => {
      const name = state.setName.trim();
      if (!name) { alert('請輸入組合名稱'); return; }
      if (!state.selected.size) { alert('尚未選站'); return; }
      upsertSet(name, [...state.selected]);
      sync();
    };
    saveCard.appendChild(saveBtn);

    const sets = loadSets();
    const list = document.createElement('div');
    list.className = 'saved-sets';
    list.style.marginTop = '0.65rem';
    if (!sets.length) {
      list.innerHTML = `<p class="hint">尚無儲存的組合</p>`;
    } else {
      for (const s of sets) {
        const row = document.createElement('div');
        row.className = 'saved-row';
        const info = document.createElement('div');
        info.innerHTML = `<strong>${escapeHtml(s.name)}</strong><div class="hint">${s.selectedIds.length} 站</div>`;
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '0.25rem';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'ghost';
        loadBtn.textContent = '載入';
        loadBtn.onclick = () => {
          state.selected = new Set(s.selectedIds.filter(id => stations.some(x => x.id === id)));
          state.setName = s.name;
          sync();
        };
        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '刪';
        delBtn.onclick = () => {
          if (confirm(`刪除「${s.name}」？`)) {
            deleteSet(s.name);
            sync();
          }
        };
        actions.append(loadBtn, delBtn);
        row.append(info, actions);
        list.appendChild(row);
      }
    }
    saveCard.appendChild(list);
    side.appendChild(saveCard);

    // station picker
    const main = document.createElement('div');
    main.className = 'card';
    grid.appendChild(main);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = cls || '';
      b.textContent = label;
      b.onclick = fn;
      return b;
    };
    toolbar.append(
      mkBtn('全選', 'ghost', () => { stations.forEach(s => state.selected.add(s.id)); sync(); }),
      mkBtn('清除', 'ghost', () => { state.selected.clear(); sync(); }),
      mkBtn('自動挑台華語不同的站', 'secondary', () => {
        state.selected = new Set(stations.filter(s => s.differs).map(s => s.id));
        sync();
      }),
    );
    const randWrap = document.createElement('span');
    randWrap.style.display = 'inline-flex';
    randWrap.style.gap = '0.3rem';
    randWrap.style.alignItems = 'center';
    const randInput = document.createElement('input');
    randInput.type = 'number';
    randInput.min = 6; randInput.max = 80;
    randInput.value = state.randomN;
    randInput.style.width = '4rem';
    randInput.oninput = () => { state.randomN = Number(randInput.value) || 24; };
    const randBtn = mkBtn('隨機 N 站', 'ghost', () => {
      const n = Math.min(Math.max(6, state.randomN), stations.length);
      const shuffled = [...stations].sort(() => Math.random() - 0.5);
      state.selected = new Set(shuffled.slice(0, n).map(s => s.id));
      sync();
    });
    randWrap.append(randInput, randBtn);
    toolbar.appendChild(randWrap);
    main.appendChild(toolbar);

    const differsHint = document.createElement('p');
    differsHint.className = 'hint';
    differsHint.textContent = `標有 ≠ 的站表示台語建議寫法／名稱與華語常用寫法不同（共 ${stations.filter(s => s.differs).length} 站）。`;
    main.appendChild(differsHint);

    const listWrap = document.createElement('div');
    for (const line of lineOrderList(stations)) {
      const block = document.createElement('div');
      block.className = 'line-block';
      const head = document.createElement('div');
      head.className = 'line-head';
      const dot = document.createElement('span');
      dot.className = 'line-dot';
      dot.style.background = LINE_COLORS[line] || '#7A8B6B';
      const title = document.createElement('span');
      const lineStations = stations.filter(s => s.line === line);
      const selectedInLine = lineStations.filter(s => state.selected.has(s.id)).length;
      title.textContent = `${line}（${selectedInLine}/${lineStations.length}）`;
      const lineBtn = document.createElement('button');
      lineBtn.className = 'ghost';
      lineBtn.style.padding = '0.25rem 0.7rem';
      lineBtn.style.fontSize = '0.8rem';
      const allOn = selectedInLine === lineStations.length;
      lineBtn.textContent = allOn ? '取消整線' : '選整線';
      lineBtn.onclick = () => {
        if (allOn) lineStations.forEach(s => state.selected.delete(s.id));
        else lineStations.forEach(s => state.selected.add(s.id));
        sync();
      };
      head.append(dot, title, lineBtn);
      block.appendChild(head);

      const gridSt = document.createElement('div');
      gridSt.className = 'station-list';
      for (const s of lineStations.sort((a, b) => a.lineOrder - b.lineOrder)) {
        const item = document.createElement('label');
        item.className = 'station-item' + (s.differs ? ' differs' : '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.selected.has(s.id);
        cb.onchange = () => {
          if (cb.checked) state.selected.add(s.id);
          else state.selected.delete(s.id);
          const countEl = el.querySelector('#sel-count');
          if (countEl) countEl.textContent = state.selected.size;
          // refresh line header counts lightly
          title.textContent = `${line}（${lineStations.filter(x => state.selected.has(x.id)).length}/${lineStations.length}）`;
          const nowAll = lineStations.every(x => state.selected.has(x.id));
          lineBtn.textContent = nowAll ? '取消整線' : '選整線';
        };
        const text = document.createElement('span');
        text.innerHTML = `<span class="name">${escapeHtml(s.mandarin)}</span>
          <span class="tl-mini" lang="nan-Latn-TW">${escapeHtml(s.taigiTl || '')}</span>`;
        item.append(cb, text);
        gridSt.appendChild(item);
      }
      block.appendChild(gridSt);
      listWrap.appendChild(block);
    }
    main.appendChild(listWrap);
  }

  sync();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
