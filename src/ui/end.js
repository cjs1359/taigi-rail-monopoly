export function renderEnd(root, { game, stations, onReplay, onSetup }) {
  const el = document.createElement('div');
  el.className = 'screen end-screen';
  root.replaceChildren(el);

  const ranking = game.winnerRanking || [];
  const byId = new Map(stations.map(s => [s.id, s]));

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `
    <div>
      <h1>本局結算</h1>
      <p class="sub">依資產（旅費＋車站價值）排名，答對題數作為次要排序。</p>
    </div>`;
  el.appendChild(hero);

  const printArea = document.createElement('div');
  printArea.className = 'print-area card';
  el.appendChild(printArea);

  const ranks = document.createElement('div');
  ranks.className = 'end-rank';
  ranking.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <div class="rank-pos">${i + 1}</div>
      <div>
        <strong><span class="swatch" style="background:${r.color}"></span> ${escapeHtml(r.name)}</strong>
        <div class="hint">答對 ${r.correct} 題 · 車站 ${r.properties.length} · ${r.bankrupt ? '破產' : '完賽'}</div>
      </div>
      <div><strong>$${r.totalAssets}</strong></div>`;
    ranks.appendChild(row);
  });
  printArea.appendChild(ranks);

  const wrongSection = document.createElement('div');
  wrongSection.className = 'wrong-section';
  wrongSection.innerHTML = `<h3>答錯地名複習清單</h3>
    <p class="hint">可列印或複製給學生課後複習。</p>`;

  let anyWrong = false;
  ranking.forEach(r => {
    if (!r.wrongAnswers?.length) return;
    anyWrong = true;
    const h = document.createElement('h4');
    h.textContent = r.name;
    wrongSection.appendChild(h);
    const table = document.createElement('table');
    table.className = 'wrong-list';
    table.innerHTML = `<thead><tr>
      <th>華語站名</th><th>台羅</th><th>建議漢字</th><th>你的答案</th><th>正確答案</th><th>備註</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    r.wrongAnswers.forEach(w => {
      const st = byId.get(w.stationId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(w.reveal?.mandarin || st?.mandarin || w.stationId)}</td>
        <td class="tl">${escapeHtml(w.reveal?.taigiTl || st?.taigiTl || '')}</td>
        <td>${escapeHtml(w.reveal?.taigiHanji || st?.taigiHanji || '—')}</td>
        <td class="tl">${escapeHtml(w.chosen)}</td>
        <td class="tl">${escapeHtml(w.correctAnswer)}</td>
        <td>${escapeHtml(w.reveal?.taigiNote || '')}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrongSection.appendChild(table);
  });
  if (!anyWrong) {
    const p = document.createElement('p');
    p.textContent = '本局沒有答錯的題目，太棒了！';
    wrongSection.appendChild(p);
  }
  printArea.appendChild(wrongSection);

  const actions = document.createElement('div');
  actions.className = 'toolbar no-print';
  actions.style.marginTop = '1rem';
  const printBtn = document.createElement('button');
  printBtn.className = 'secondary';
  printBtn.textContent = '列印／匯出複習單';
  printBtn.onclick = () => window.print();
  const copyBtn = document.createElement('button');
  copyBtn.className = 'ghost';
  copyBtn.textContent = '複製複習文字';
  copyBtn.onclick = async () => {
    const lines = ['【台語地名鐵路環島大富翁｜答錯複習】'];
    ranking.forEach(r => {
      if (!r.wrongAnswers?.length) return;
      lines.push(`\n■ ${r.name}`);
      r.wrongAnswers.forEach(w => {
        lines.push(`- ${w.reveal?.mandarin || ''}｜台羅 ${w.reveal?.taigiTl || ''}｜漢字 ${w.reveal?.taigiHanji || '—'}｜正解 ${w.correctAnswer}`);
      });
    });
    if (lines.length === 1) lines.push('（本局無錯題）');
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copyBtn.textContent = '已複製！';
      setTimeout(() => { copyBtn.textContent = '複製複習文字'; }, 1500);
    } catch {
      alert(lines.join('\n'));
    }
  };
  const again = document.createElement('button');
  again.textContent = '用同一組站再玩';
  again.onclick = onReplay;
  const setup = document.createElement('button');
  setup.className = 'ghost';
  setup.textContent = '回到選站';
  setup.onclick = onSetup;
  actions.append(printBtn, copyBtn, again, setup);
  el.appendChild(actions);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
