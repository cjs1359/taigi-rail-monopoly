/**
 * Classic square Monopoly-style board (HTML/CSS, horizontal readable labels).
 * Counter-clockwise from 起點 at bottom-left, matching trip order:
 * left↑ (西下車) → top→ (中南部) → right↓ (東部北上) → bottom← (宜蘭／北回臺北).
 *
 * Tokens travel on an OUTER lane beyond each square so names / Tâi-lô stay clear.
 */

import { labelsForSides } from '../engine/board.js';
import { renderPiece } from './pieces.js';

const TYPE_FILL = {
  start: '#f0d78c',
  branch: '#e8d5f0',
  lore: '#d5e8f0',
  rest: '#e8dcc8',
  station: '#fffef8',
};

/** Outer token-lane depth (% of board). Squares sit inside this ring. */
export const TOKEN_LANE = 11;
/** Square track depth (% of board). */
export const SQUARE_TRACK = 12.5;

/** @deprecated name kept for callers; returns HTML board. */
export function renderBoardSvg(board, players, opts = {}) {
  return renderMonoBoard(board, players, opts);
}

export function renderMonoBoard(board, players, { lastLandedIndex = null, stations = null, animatingId = null } = {}) {
  const n = board.squares.length;
  const ownerByStation = new Map();
  players.forEach(p => p.properties.forEach(id => ownerByStation.set(id, p)));

  const layout = layoutPerimeter(n);
  const inset = TOKEN_LANE + SQUARE_TRACK; // center starts here

  const boardEl = document.createElement('div');
  boardEl.className = 'mono-board';
  boardEl.style.setProperty('--token-lane', `${TOKEN_LANE}%`);
  boardEl.style.setProperty('--square-track', `${SQUARE_TRACK}%`);
  boardEl.style.setProperty('--board-inset', `${inset}%`);
  boardEl.setAttribute('role', 'img');
  boardEl.setAttribute('aria-label', '環島方型棋盤');

  const catalog = stations || [...board.stationById.values()];
  const sideStations = [[], [], [], []];
  board.squares.forEach((sq, i) => {
    if (sq.type !== 'station') return;
    const st = board.stationById.get(sq.stationId);
    if (st) sideStations[layout[i].side].push(st);
  });
  const sideLabels = labelsForSides(sideStations, catalog);
  const hintClass = ['hint-west', 'hint-south', 'hint-east', 'hint-north'];
  sideLabels.forEach((text, side) => {
    if (!text) return;
    const h = document.createElement('div');
    h.className = `mono-hint ${hintClass[side]}`;
    h.textContent = text;
    boardEl.appendChild(h);
  });

  const center = document.createElement('div');
  center.className = 'mono-center-slot';
  center.dataset.slot = 'center';

  const map = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  map.setAttribute('class', 'tw-outline');
  map.setAttribute('viewBox', '0 0 60 90');
  map.setAttribute('aria-hidden', 'true');
  map.innerHTML = `
    <path d="M28 4 C34 6 40 12 42 20 C44 28 46 36 45 44 C44 54 42 62 38 70
      C34 78 30 84 26 86 C20 84 16 76 14 66 C12 56 10 46 12 36 C14 24 18 12 22 6 Z"
      fill="#dce8e2" stroke="#3d7a6a" stroke-width="1.5"/>
    <path d="M30 22 L26 38 L30 34 L34 48" fill="none" stroke="#c75b39" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="34,48 30,42 38,44" fill="#c75b39"/>
    <text x="30" y="16" text-anchor="middle" font-size="7" fill="#3d7a6a">環島</text>
  `;
  center.appendChild(map);
  boardEl.appendChild(center);

  board.squares.forEach((sq, i) => {
    const pos = layout[i];
    const cell = document.createElement('div');
    cell.className = [
      'mono-sq',
      `side-${pos.side}`,
      pos.corner ? 'corner' : '',
      sq.type !== 'station' ? `type-${sq.type}` : '',
      i === lastLandedIndex ? 'landed' : '',
    ].filter(Boolean).join(' ');
    cell.dataset.sqIndex = String(i);
    cell.style.left = `${pos.left}%`;
    cell.style.top = `${pos.top}%`;
    cell.style.width = `${pos.width}%`;
    cell.style.height = `${pos.height}%`;

    const owner = sq.type === 'station' ? ownerByStation.get(sq.stationId) : null;
    if (owner) {
      cell.classList.add('owned');
      cell.style.setProperty('--owner', owner.color);
    }

    const strip = document.createElement('div');
    strip.className = 'mono-strip';
    strip.style.background = sq.type === 'station' ? (sq.color || '#7A8B6B')
      : sq.type === 'start' ? '#c4a35a'
      : sq.type === 'branch' ? '#9B6B9B'
      : sq.type === 'lore' ? '#4A90A4'
      : sq.type === 'rest' ? '#8B6B4A'
      : '#aaa';
    // Owner badge lives only inside the colour strip — never over name / TL
    if (owner) {
      const badge = renderPiece(owner, { size: 22, className: 'owner-badge' });
      strip.appendChild(badge);
    }
    cell.appendChild(strip);

    const body = document.createElement('div');
    body.className = 'mono-sq-body';
    body.style.background = TYPE_FILL[sq.type] || TYPE_FILL.station;

    const name = document.createElement('div');
    name.className = 'mono-name';
    name.textContent = sq.type === 'branch' && sq.branchName ? sq.branchName : sq.label;
    body.appendChild(name);

    if (sq.type === 'station' && sq.taigiTl) {
      const tl = document.createElement('div');
      tl.className = 'mono-tl';
      tl.setAttribute('lang', 'nan-Latn-TW');
      tl.textContent = sq.taigiTl;
      body.appendChild(tl);
    }
    cell.appendChild(body);
    boardEl.appendChild(cell);

    // Outer token lane (sibling of square, never inside text body)
    const tokensHere = players.filter(p => !p.bankrupt && p.position === i);
    if (tokensHere.length) {
      const lane = tokenLaneRect(pos);
      const tokenRow = document.createElement('div');
      tokenRow.className = `mono-token-lane side-${pos.side}` + (pos.corner ? ' corner' : '');
      tokenRow.dataset.sqIndex = String(i);
      tokenRow.style.left = `${lane.left}%`;
      tokenRow.style.top = `${lane.top}%`;
      tokenRow.style.width = `${lane.width}%`;
      tokenRow.style.height = `${lane.height}%`;

      const count = tokensHere.length;
      // Large, readable tokens (≈28–36px). 4-up uses a 2×2 grid in the lane.
      const size = count >= 4 ? 30 : count === 3 ? 32 : count === 2 ? 34 : 38;
      if (count >= 4) tokenRow.classList.add('grid-2x2');
      else if (count === 3) tokenRow.classList.add('row-3');
      tokensHere.forEach((p) => {
        const wrap = renderPiece(p, {
          size,
          bounce: Boolean(p._bounce),
          className: 'mono-token-piece',
        });
        wrap.dataset.tokenPlayer = p.id;
        wrap.dataset.teamColor = p.color;
        tokenRow.appendChild(wrap);
      });
      boardEl.appendChild(tokenRow);
    }
  });

  return { svg: boardEl, boardEl, positions: layout, centerSlot: center };
}

/** Outer-edge lane rect for a square (percent of board). */
export function tokenLaneRect(pos) {
  const L = TOKEN_LANE;
  if (pos.side === 0) {
    // left outer
    return { left: 0, top: pos.top, width: L, height: pos.height };
  }
  if (pos.side === 1) {
    // top outer
    return { left: pos.left, top: 0, width: pos.width, height: L };
  }
  if (pos.side === 2) {
    // right outer
    return { left: 100 - L, top: pos.top, width: L, height: pos.height };
  }
  // bottom outer
  return { left: pos.left, top: 100 - L, width: pos.width, height: L };
}

function sideLengths(n) {
  const base = Math.floor(n / 4);
  const rem = n % 4;
  return [0, 1, 2, 3].map(i => Math.max(1, base + (i < rem ? 1 : 0)));
}

/**
 * Side 0 left bottom→top, 1 top left→right, 2 right top→bottom, 3 bottom right→left.
 * Squares are inset by TOKEN_LANE so the outer ring is free for tokens.
 */
export function layoutPerimeter(n) {
  const lane = TOKEN_LANE;
  const track = SQUARE_TRACK;
  const lens = sideLengths(n);
  while (lens.reduce((a, b) => a + b, 0) > n) {
    const i = lens.indexOf(Math.max(...lens));
    if (lens[i] > 1) lens[i]--;
    else break;
  }
  while (lens.reduce((a, b) => a + b, 0) < n) {
    lens[lens.indexOf(Math.min(...lens))]++;
  }

  // Inner edge of token lane = start of square track
  const corners = [
    { left: lane, top: 100 - lane - track },           // BL
    { left: lane, top: lane },                         // TL
    { left: 100 - lane - track, top: lane },           // TR
    { left: 100 - lane - track, top: 100 - lane - track }, // BR
  ];
  const edgeSpan = 100 - 2 * (lane + track);
  const out = [];

  for (let side = 0; side < 4; side++) {
    const len = lens[side];
    const edgeCount = Math.max(0, len - 1);
    out.push({
      side, corner: true,
      left: corners[side].left,
      top: corners[side].top,
      width: track,
      height: track,
    });
    for (let e = 0; e < edgeCount; e++) {
      const seg = edgeSpan / edgeCount;
      if (side === 0) {
        const top = 100 - lane - track - (e + 1) * seg;
        out.push({ side, corner: false, left: lane, top, width: track, height: seg });
      } else if (side === 1) {
        out.push({
          side, corner: false,
          left: lane + track + e * seg, top: lane, width: seg, height: track,
        });
      } else if (side === 2) {
        out.push({
          side, corner: false,
          left: 100 - lane - track, top: lane + track + e * seg, width: track, height: seg,
        });
      } else {
        const left = 100 - lane - track - (e + 1) * seg;
        out.push({
          side, corner: false, left, top: 100 - lane - track, width: seg, height: track,
        });
      }
    }
  }
  return out;
}
