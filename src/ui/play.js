import {
  rollDice, answerBuy, answerRent, ack, forceEnd, STATION_PRICE, BASE_RENT,
} from '../engine/game.js';
import { renderBoardSvg, ensureLabelsFit } from './boardView.js';
import { renderPiece } from './pieces.js';
import {
  unlockAudio, renderAudioControls,
  sfxDice, sfxStep, sfxArrive, sfxCorrect, sfxWrong,
  sfxBuy, sfxRent, sfxPassStart, sfxLore, sfxBranch, sfxRest, sfxTurn,
} from './audio.js';

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fitBoard(wrap) {
  const parent = wrap?.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = Math.max(0, parent.clientWidth - padX);
  const availH = Math.max(0, parent.clientHeight - padY);
  // Prefer the limiting dimension so the board fills the panel without empty margin.
  const s = Math.max(260, Math.floor(Math.min(availW || availH, availH || availW)));
  if (s > 0 && Number.isFinite(s)) {
    wrap.style.width = `${s}px`;
    wrap.style.height = `${s}px`;
    wrap.style.maxWidth = '100%';
    wrap.style.maxHeight = '100%';
  }
}


export function renderPlay(root, { game, stations, onEnd, onExit }) {
  let state = game;
  /** @type {(() => void) | null} */
  let fitBoardResize = null;

  let lastDice = null;
  let lastLandedIndex = null;
  let animating = false;
  let displayPlayers = null; // temporary positions during hop
  let prevPlayerIndex = state.currentPlayerIndex;
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

  function playLandSfx(next, fromPos) {
    const sq = next.pending?.square;
    const player = next.players[next.currentPlayerIndex];
    const size = next.board.squares.length;
    // Detect pass-start from log or position wrap
    if (fromPos != null && player) {
      const roll = next.pending?.roll || 0;
      if (fromPos + roll >= size) sfxPassStart();
    }
    if (!sq) return;
    if (sq.type === 'station') sfxArrive();
    else if (sq.type === 'branch') sfxBranch();
    else if (sq.type === 'lore') sfxLore();
    else if (sq.type === 'rest') sfxRest();
    else if (sq.type === 'start') sfxArrive();
  }

  function maybeTurnSfx(next) {
    if (next.currentPlayerIndex !== prevPlayerIndex && next.phase === 'await_roll') {
      sfxTurn();
    }
    prevPlayerIndex = next.currentPlayerIndex;
  }

  function apply(next, { fromPos = null, skipLandSfx = false } = {}) {
    if (!skipLandSfx && fromPos != null) playLandSfx(next, fromPos);
    maybeTurnSfx(next);
    state = next;
    displayPlayers = null;
    if (finishIfEnded(state)) return;
    paint();
  }

  function playersForBoard() {
    const list = (displayPlayers || state.players).map(p => ({ ...p }));
    const curId = state.players[state.currentPlayerIndex]?.id;
    list.forEach(p => {
      p._bounce = !animating && p.id === curId && state.phase === 'await_roll';
    });
    return list;
  }

  async function animateHop(fromPos, toPos, roll, nextState) {
    const size = nextState.board.squares.length;
    const idx = state.currentPlayerIndex;
    if (reducedMotion() || roll <= 0) {
      displayPlayers = null;
      lastLandedIndex = toPos;
      apply(nextState, { fromPos });
      return;
    }
    animating = true;
    paint(); // disable buttons
    for (let step = 1; step <= roll; step++) {
      const pos = (fromPos + step) % size;
      displayPlayers = state.players.map((p, i) => (
        i === idx ? { ...p, position: pos } : { ...p }
      ));
      lastLandedIndex = pos;
      sfxStep();
      paint();
      await sleep(160);
    }
    animating = false;
    displayPlayers = null;
    lastLandedIndex = toPos;
    apply(nextState, { fromPos });
  }

  function paint() {
    if (!fitBoardResize) {
      fitBoardResize = () => {
        const w = el.querySelector('.board-wrap');
        const b = el.querySelector('.mono-board');
        if (w) fitBoard(w);
        if (b) ensureLabelsFit(b);
      };
      window.addEventListener('resize', fitBoardResize);
    }
    el.innerHTML = '';
    const p = current();
    const rem = remainingMs();

    const banner = document.createElement('div');
    banner.className = 'turn-banner';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'turn-name';
    nameDiv.appendChild(renderPiece(p, { size: 28, bounce: !animating && state.phase === 'await_roll' }));
    const nameSpan = document.createElement('span');
    nameSpan.textContent = ` ${p.name} 的回合`;
    nameDiv.appendChild(nameSpan);
    const meta = document.createElement('div');
    meta.className = 'turn-meta';
    meta.textContent = `第 ${state.turnNumber} 手`
      + (rem != null ? ` · 剩餘 ${fmtTime(rem)}` : '')
      + ` · 旅費 $${p.cash} · 車站 ${p.properties.length}`;
    banner.append(nameDiv, meta);

    const audioBar = document.createElement('div');
    audioBar.className = 'audio-bar';
    audioBar.appendChild(renderAudioControls({ compact: true }));
    banner.appendChild(audioBar);
    el.appendChild(banner);

    const layout = document.createElement('div');
    layout.className = 'play-layout';
    el.appendChild(layout);

    const boardCard = document.createElement('div');
    boardCard.className = 'card board-card';
    layout.appendChild(boardCard);

    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    const lastIdx = state.pending?.square
      ? state.board.squares.findIndex(sq => sq.id === state.pending.square.id)
      : (typeof lastLandedIndex === 'number' ? lastLandedIndex : null);
    const { boardEl, centerSlot } = renderBoardSvg(state.board, playersForBoard(), {
      lastLandedIndex: lastIdx,
      stations,
    });
    wrap.appendChild(boardEl);

    const dice = document.createElement('div');
    dice.className = 'dice-face';
    dice.textContent = lastDice != null ? String(lastDice) : '🎲';
    centerSlot.appendChild(dice);

    const turnLine = document.createElement('div');
    turnLine.style.fontWeight = '700';
    turnLine.style.fontSize = '0.95rem';
    turnLine.style.display = 'flex';
    turnLine.style.alignItems = 'center';
    turnLine.style.gap = '0.35rem';
    turnLine.appendChild(renderPiece(p, { size: 28, bounce: !animating && state.phase === 'await_roll' }));
    turnLine.appendChild(document.createTextNode(p.name));
    centerSlot.appendChild(turnLine);

    if (lastIdx != null && lastIdx >= 0) {
      const sq = state.board.squares[lastIdx];
      const card = document.createElement('div');
      card.className = 'landed-card';
      const st = sq.stationId ? state.board.stationById.get(sq.stationId) : null;
      const title = sq.type === 'branch' && sq.branchName ? sq.branchName : sq.label;
      card.innerHTML = `<strong>${escapeHtml(title)}</strong>` +
        (st?.taigiTl ? `<div class="tl" lang="nan-Latn-TW">${escapeHtml(st.taigiTl)}</div>` : '') +
        (st?.taigiHanji ? `<div>漢字：${escapeHtml(st.taigiHanji)}</div>` : '') +
        (sq.line ? `<div class="hint">${escapeHtml(sq.line)}</div>` : '');
      centerSlot.appendChild(card);
    }

    const miniLog = document.createElement('div');
    miniLog.className = 'center-log';
    state.log.slice(-4).reverse().forEach(line => {
      const d = document.createElement('div');
      d.textContent = line;
      miniLog.appendChild(d);
    });
    centerSlot.appendChild(miniLog);

    const actions = document.createElement('div');
    actions.className = 'actions';
    if (!reveal && !animating && state.phase === 'await_roll') {
      const rollBtn = document.createElement('button');
      rollBtn.textContent = '擲骰子';
      rollBtn.onclick = async () => {
        unlockAudio();
        const fromPos = state.players[state.currentPlayerIndex].position;
        sfxDice();
        const next = rollDice(state);
        lastDice = next.pending?.roll ?? lastDice;
        const toPos = next.players[state.currentPlayerIndex].position;
        const roll = next.pending?.roll ?? 0;
        if (next.pending?.square) {
          const id = next.pending.square.id;
          lastLandedIndex = next.board.squares.findIndex(sq => sq.id === id);
        }
        await animateHop(fromPos, toPos, roll, next);
      };
      actions.appendChild(rollBtn);
    } else if (!reveal && !animating && (state.phase === 'await_ack' || state.phase === 'await_lore')) {
      const ok = document.createElement('button');
      ok.textContent = '繼續';
      ok.onclick = () => {
        unlockAudio();
        apply(ack(state));
      };
      actions.appendChild(ok);
    }
    const endBtn = document.createElement('button');
    endBtn.className = 'ghost';
    endBtn.textContent = '結束遊戲';
    endBtn.disabled = animating;
    endBtn.onclick = () => {
      if (confirm('確定結束並結算？')) apply(forceEnd(state));
    };
    actions.appendChild(endBtn);
    centerSlot.appendChild(actions);
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
      const head = document.createElement('h3');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.gap = '0.4rem';
      head.appendChild(renderPiece(pl, {
        size: 32,
        bounce: idx === state.currentPlayerIndex && !animating && state.phase === 'await_roll',
      }));
      head.appendChild(document.createTextNode(
        `${pl.name}${pl.bankrupt ? '（破產）' : ''}`,
      ));
      card.appendChild(head);
      const props = pl.properties
        .map(id => state.board.stationById.get(id)?.mandarin || id)
        .join('、') || '—';
      const stats = document.createElement('div');
      stats.className = 'player-stats';
      stats.innerHTML = `旅費 $${pl.cash} · 答對 ${pl.correct} · 錯 ${pl.wrong.length}<br/>車站：${escapeHtml(props)}`;
      card.appendChild(stats);
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

    const settings = document.createElement('div');
    settings.className = 'card';
    settings.innerHTML = `<strong>音效設定</strong>`;
    settings.appendChild(renderAudioControls());
    side.appendChild(settings);

    const exit = document.createElement('button');
    exit.className = 'secondary';
    exit.textContent = '回選站畫面';
    exit.disabled = animating;
    exit.onclick = () => {
      if (confirm('離開目前這局？進度不會保留。')) onExit();
    };
    side.appendChild(exit);

    if (reveal) {
      el.appendChild(buildRevealModal(reveal, () => {
        const next = reveal.next;
        const phase = reveal.phase;
        if (phase === 'await_buy_answer' && reveal.correct && String(reveal.message).includes('買')) sfxBuy();
        if (phase === 'await_rent_answer') sfxRent();
        reveal = null;
        apply(next);
      }));
    } else if (!animating && (state.phase === 'await_buy_answer' || state.phase === 'await_rent_answer')) {
      el.appendChild(buildQuestionModal(state, {
        onAnswer: (idx) => {
          unlockAudio();
          const q = state.pending.question;
          const phase = state.phase;
          const correct = idx === q.answerIndex;
          if (correct) sfxCorrect(); else sfxWrong();
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
            phase,
          };
          paint();
        },
      }));
    } else if (!animating && state.phase === 'await_lore' && state.pending?.card) {
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
    voidFocus(modal);
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
    voidFocus(modal);
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
    voidFocus(modal);
    return backdrop;
  }

  function voidFocus(modal) {
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
    if (meta && rem != null && !reveal && !animating) {
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
