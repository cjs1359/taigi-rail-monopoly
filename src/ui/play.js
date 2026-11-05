import {
  rollDice, answerBuy, answerRent, ack, forceEnd, STATION_PRICE, BASE_RENT,
} from '../engine/game.js';
import { renderBoardSvg } from './boardView.js';

export function renderPlay(root, { game, stations, onEnd, onExit }) {
  let state = game;
  let lastDice = null;
  /** @type {null | { question: any, correct: boolean, message: string, next: any }} */
  let reveal = null;

  const el = document.createElement('div');
  el.className = 'screen play-screen';
  root.replaceChildren(el);

  function current() {
    return state.players[state.currentPlayerIndex];
  }

  function remainingMs() {
    if (!state.timeLimitMin) return null;
    return Math.max(0, state.timeLimitMin * 60000 - (state.now() - state.startedAt));
  }

  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function finishIfEnded(next) {
    if (next.phase === 'ended') {
      onEnd(next);
      return true;
    }
    return false;
  }

  function apply(next) {
    state = next;
    if (finishIfEnded(state)) return;
    paint();
  }

  function paint() {
    el.innerHTML = '';
    const p = current();
    const rem = remainingMs();

    const banner = document.createElement('div');
    banner.className = 'turn-banner';
    banner.innerHTML = `
      <div class="turn-name">
        <span class="swatch" style="background:${p.color};width:1.4rem;height:1.4rem"></span>
        ${escapeHtml(p.name)} 的回合
      </div>
      <div class="turn-meta">
        第 ${state.turnNumber} 手
        ${rem != null ? `· 剩餘 ${fmtTime(rem)}` : ''}
        · 旅費 $${p.cash}
        · 車站 ${p.properties.length}
      </div>`;
    el.appendChild(banner);

    const layout = document.createElement('div');
    layout.className = 'play-layout';
    el.appendChild(layout);

    const boardCard = document.createElement('div');
    boardCard.className = 'card';
    layout.appendChild(boardCard);

    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    const { svg } = renderBoardSvg(state.board, state.players);
    wrap.appendChild(svg);

    const center = document.createElement('div');
    center.className = 'board-center';
    const dice = document.createElement('div');
    dice.className = 'dice-face';
    dice.textContent = lastDice != null ? String(lastDice) : '🎲';
    center.appendChild(dice);

    const actions = document.createElement('div');
    actions.className = 'actions';
    if (!reveal && state.phase === 'await_roll') {
      const rollBtn = document.createElement('button');
      rollBtn.textContent = '擲骰子';
      rollBtn.onclick = () => {
        const next = rollDice(state);
        lastDice = next.pending?.roll ?? lastDice;
        apply(next);
      };
      actions.appendChild(rollBtn);
    } else if (!reveal && (state.phase === 'await_ack' || state.phase === 'await_lore')) {
      const ok = document.createElement('button');
      ok.textContent = '繼續';
      ok.onclick = () => apply(ack(state));
      actions.appendChild(ok);
    }
    const endBtn = document.createElement('button');
    endBtn.className = 'ghost';
    endBtn.textContent = '結束遊戲';
    endBtn.onclick = () => {
      if (confirm('確定結束並結算？')) apply(forceEnd(state));
    };
    actions.appendChild(endBtn);
    center.appendChild(actions);
    wrap.appendChild(center);
    boardCard.appendChild(wrap);

    const side = document.createElement('div');
    side.className = 'side-panel';
    layout.appendChild(side);

    state.players.forEach((pl, idx) => {
      const card = document.createElement('div');
      card.className = 'card player-card' +
        (idx === state.currentPlayerIndex ? ' active' : '') +
        (pl.bankrupt ? ' bankrupt' : '');
      card.style.borderLeftColor = pl.color;
      const props = pl.properties
        .map(id => state.board.stationById.get(id)?.mandarin || id)
        .join('、') || '—';
      card.innerHTML = `
        <h3>${escapeHtml(pl.name)}${pl.bankrupt ? '（破產）' : ''}</h3>
        <div class="player-stats">
          旅費 $${pl.cash} · 答對 ${pl.correct} · 錯 ${pl.wrong.length}<br/>
          車站：${escapeHtml(props)}
        </div>`;
      side.appendChild(card);
    });

    const logCard = document.createElement('div');
    logCard.className = 'card';
    logCard.innerHTML = `<strong>旅途紀錄</strong>`;
    const logBox = document.createElement('div');
    logBox.className = 'log-box';
    state.log.slice(-12).reverse().forEach(line => {
      const d = document.createElement('div');
      d.textContent = line;
      logBox.appendChild(d);
    });
    logCard.appendChild(logBox);
    side.appendChild(logCard);

    const exit = document.createElement('button');
    exit.className = 'secondary';
    exit.textContent = '回選站畫面';
    exit.onclick = () => {
      if (confirm('離開目前這局？進度不會保留。')) onExit();
    };
    side.appendChild(exit);

    if (reveal) {
      el.appendChild(buildRevealModal(reveal, () => {
        const next = reveal.next;
        reveal = null;
        apply(next);
      }));
    } else if (state.phase === 'await_buy_answer' || state.phase === 'await_rent_answer') {
      el.appendChild(buildQuestionModal(state, {
        onAnswer: (idx) => {
          const q = state.pending.question;
          const phase = state.phase;
          const correct = idx === q.answerIndex;
          const next = phase === 'await_buy_answer'
            ? answerBuy(state, idx)
            : answerRent(state, idx);
          reveal = {
            question: q,
            correct,
            message: phase === 'await_buy_answer'
              ? (correct ? '答對了！可以買下這站。' : '答錯了，本回合無法購買。')
              : (correct ? '答對了！租金減半。' : '答錯了，需付全額租金。'),
            next,
          };
          paint();
        },
      }));
    } else if (state.phase === 'await_lore' && state.pending?.card) {
      el.appendChild(buildLoreModal(state.pending.card, () => apply(ack(state))));
    }
  }

  function buildQuestionModal(st, { onAnswer }) {
    const q = st.pending.question;
    const isBuy = st.phase === 'await_buy_answer';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<h2>${isBuy ? '買下車站' : '過路答題'}</h2>
      <p class="prompt">${escapeHtml(q.prompt)}</p>
      ${isBuy
        ? `<p class="hint">答對且旅費足夠（$${STATION_PRICE}）即可購入。答錯本回合不能買。</p>`
        : `<p class="hint">答對租金減半（原價 $${BASE_RENT}）。</p>`}`;

    if (st.readAloud) {
      const aloud = document.createElement('div');
      aloud.className = 'read-aloud';
      aloud.setAttribute('lang', 'zh-Hant');
      aloud.textContent = q.reveal.mandarin;
      modal.appendChild(aloud);
      const tip = document.createElement('p');
      tip.className = 'hint';
      tip.style.textAlign = 'center';
      tip.textContent = '大家一起先看站名，再選答案';
      modal.appendChild(tip);
    }

    const opts = document.createElement('div');
    opts.className = 'options';
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.setAttribute('lang', 'nan-Latn-TW');
      b.textContent = opt;
      b.onclick = () => onAnswer(i);
      opts.appendChild(b);
    });
    modal.appendChild(opts);
    backdrop.appendChild(modal);
    queueFocus(modal);
    return backdrop;
  }

  function buildRevealModal(data, onClose) {
    const { question: q, correct, message } = data;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <h2>${correct ? '✓ 答對' : '✗ 答錯'}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="reveal">
        <div><strong>${escapeHtml(q.reveal.mandarin)}</strong></div>
        <div class="tl" lang="nan-Latn-TW">${escapeHtml(q.reveal.taigiTl || '')}</div>
        ${q.reveal.taigiHanji ? `<div>建議漢字：${escapeHtml(q.reveal.taigiHanji)}</div>` : ''}
        ${q.reveal.taigiAlt ? `<div>又音：<span class="tl">${escapeHtml(q.reveal.taigiAlt)}</span></div>` : ''}
        ${q.reveal.taigiNote ? `<div>${escapeHtml(q.reveal.taigiNote)}</div>` : ''}
        <div class="hint">正確答案：<span class="tl">${escapeHtml(q.options[q.answerIndex])}</span></div>
      </div>`;
    const ok = document.createElement('button');
    ok.textContent = '下一步';
    ok.style.marginTop = '0.85rem';
    ok.onclick = onClose;
    modal.appendChild(ok);
    backdrop.appendChild(modal);
    queueFocus(modal);
    return backdrop;
  }

  function buildLoreModal(card, onClose) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <h2>地名典故卡</h2>
      <p><strong>${escapeHtml(card.title)}</strong></p>
      <div class="lore-body">${escapeHtml(card.body)}</div>`;
    const ok = document.createElement('button');
    ok.textContent = '收好卡片，繼續';
    ok.style.marginTop = '0.85rem';
    ok.onclick = onClose;
    modal.appendChild(ok);
    backdrop.appendChild(modal);
    queueFocus(modal);
    return backdrop;
  }

  function queueFocus(modal) {
    queueMicrotask(() => {
      const btn = modal.querySelector('button');
      btn?.focus();
    });
  }

  const timer = setInterval(() => {
    if (state.phase === 'ended') { clearInterval(timer); return; }
    const rem = remainingMs();
    if (rem === 0) {
      clearInterval(timer);
      apply(forceEnd(state));
      return;
    }
    const meta = el.querySelector('.turn-meta');
    if (meta && rem != null && !reveal) {
      const cur = current();
      meta.textContent = `第 ${state.turnNumber} 手 · 剩餘 ${fmtTime(rem)} · 旅費 $${cur.cash} · 車站 ${cur.properties.length}`;
    }
  }, 1000);

  paint();
  return () => clearInterval(timer);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
