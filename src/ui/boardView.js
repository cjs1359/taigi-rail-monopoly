/**
 * Classic square Monopoly-style board (HTML/CSS, horizontal readable labels).
 * Counter-clockwise from 起點 at bottom-left:
 * left↑ (西部) → top→ (南部) → right↓ (東部) → bottom← (北部).
 */

const TYPE_FILL = {
  start: '#f0d78c',
  branch: '#e8d5f0',
  lore: '#d5e8f0',
  rest: '#e8dcc8',
  station: '#fffef8',
};

/** @deprecated name kept for callers; returns HTML board. */
export function renderBoardSvg(board, players, opts = {}) {
  return renderMonoBoard(board, players, opts);
}

export function renderMonoBoard(board, players, { lastLandedIndex = null } = {}) {
  const n = board.squares.length;
  const ownerByStation = new Map();
  players.forEach(p => p.properties.forEach(id => ownerByStation.set(id, p)));

  const layout = layoutPerimeter(n);
  const boardEl = document.createElement('div');
  boardEl.className = 'mono-board';
  boardEl.setAttribute('role', 'img');
  boardEl.setAttribute('aria-label', '環島方型棋盤');

  for (const [cls, text] of [
    ['hint-west', '西部'],
    ['hint-south', '南部'],
    ['hint-east', '東部'],
    ['hint-north', '北部'],
  ]) {
    const h = document.createElement('div');
    h.className = `mono-hint ${cls}`;
    h.textContent = text;
    boardEl.appendChild(h);
  }

  const center = document.createElement('div');
  center.className = 'mono-center-slot';
  center.dataset.slot = 'center';
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

    const tokensHere = players.filter(p => !p.bankrupt && p.position === i);
    if (tokensHere.length) {
      const tokenRow = document.createElement('div');
      tokenRow.className = 'mono-tokens';
      tokensHere.forEach(p => {
        const t = document.createElement('span');
        t.className = 'mono-token';
        t.style.background = p.color;
        t.title = p.name;
        tokenRow.appendChild(t);
      });
      cell.appendChild(tokenRow);
    }

    boardEl.appendChild(cell);
  });

  return { svg: boardEl, boardEl, positions: layout, centerSlot: center };
}

/** Split n into 4 side lengths (each includes its starting corner). */
function sideLengths(n) {
  const base = Math.floor(n / 4);
  const rem = n % 4;
  return [0, 1, 2, 3].map(i => Math.max(1, base + (i < rem ? 1 : 0)));
}

/**
 * Side 0 left bottom→top, 1 top left→right, 2 right top→bottom, 3 bottom right→left.
 * Corners: BL, TL, TR, BR — each owned by the side that starts there.
 */
function layoutPerimeter(n) {
  const track = 17; // % depth of perimeter track
  const lens = sideLengths(n);
  // Ensure sum === n (sideLengths with max(1) can overshoot for tiny n; clamp for our 6–40 range)
  while (lens.reduce((a, b) => a + b, 0) > n) {
    const i = lens.indexOf(Math.max(...lens));
    if (lens[i] > 1) lens[i]--;
    else break;
  }
  while (lens.reduce((a, b) => a + b, 0) < n) {
    lens[lens.indexOf(Math.min(...lens))]++;
  }

  const corners = [
    { left: 0, top: 100 - track },             // BL
    { left: 0, top: 0 },                       // TL
    { left: 100 - track, top: 0 },             // TR
    { left: 100 - track, top: 100 - track },   // BR
  ];
  const edgeSpan = 100 - 2 * track;
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
        // left: just above BL, going up → next cells have decreasing top
        const top = 100 - track - (e + 1) * seg;
        out.push({ side, corner: false, left: 0, top, width: track, height: seg });
      } else if (side === 1) {
        out.push({
          side, corner: false,
          left: track + e * seg, top: 0, width: seg, height: track,
        });
      } else if (side === 2) {
        out.push({
          side, corner: false,
          left: 100 - track, top: track + e * seg, width: track, height: seg,
        });
      } else {
        // bottom: just left of BR, going left
        const left = 100 - track - (e + 1) * seg;
        out.push({ side, corner: false, left, top: 100 - track, width: seg, height: track });
      }
    }
  }
  return out;
}
