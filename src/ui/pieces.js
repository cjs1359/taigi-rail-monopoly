/**
 * Cute chibi chess-piece tokens for the four teams.
 * Distinct silhouettes (colour-blind friendly) + per-team colour fills.
 * Each SVG gets a unique gradient id to avoid DOM id collisions.
 */

export const PIECE_DEFS = Object.freeze([
  { id: 'king', label: '國王', title: '國王 ♔' },
  { id: 'knight', label: '騎士', title: '騎士 ♘' },
  { id: 'rook', label: '城堡', title: '城堡 ♖' },
  { id: 'queen', label: '皇后', title: '皇后 ♕' },
]);

/** Canonical team colours (紅 / 青 / 藍 / 金). */
export const TEAM_COLORS = Object.freeze(['#c75b39', '#3d7a6a', '#4a90a4', '#c4a35a']);

let gradSeq = 0;
function nextGradId() {
  gradSeq = (gradSeq + 1) % 1e9;
  return `piece-grad-${gradSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pieceForIndex(index) {
  return PIECE_DEFS[((index % PIECE_DEFS.length) + PIECE_DEFS.length) % PIECE_DEFS.length];
}

export function shade(hex, amt) {
  const h = String(hex || '#888').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padStart(6, '0');
  const n = parseInt(full, 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

function baseSvg(innerFactory, { size, color, title, bounce }) {
  const gid = nextGradId();
  const light = shade(color, 55);
  const dark = shade(color, -40);
  const fill = `url(#${gid})`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'piece-svg' + (bounce ? ' piece-bounce' : ''));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  svg.dataset.teamColor = color;
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="55%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="58" rx="18" ry="4" fill="rgba(0,0,0,.16)"/>
    ${innerFactory(fill, color)}
  `;
  return svg;
}

function face(cx = 32, cy = 28) {
  return `
    <circle cx="${cx - 6}" cy="${cy}" r="2.6" fill="#2c2a26"/>
    <circle cx="${cx + 6}" cy="${cy}" r="2.6" fill="#2c2a26"/>
    <circle cx="${cx - 5.2}" cy="${cy - 0.8}" r="0.8" fill="#fff"/>
    <circle cx="${cx + 6.8}" cy="${cy - 0.8}" r="0.8" fill="#fff"/>
    <ellipse cx="${cx - 9}" cy="${cy + 5}" rx="3" ry="2" fill="#ff8fab" opacity=".55"/>
    <ellipse cx="${cx + 9}" cy="${cy + 5}" rx="3" ry="2" fill="#ff8fab" opacity=".55"/>
    <path d="M${cx - 4} ${cy + 7} Q${cx} ${cy + 11} ${cx + 4} ${cy + 7}" fill="none" stroke="#2c2a26" stroke-width="1.6" stroke-linecap="round"/>
  `;
}

function drawKing(color, size, bounce) {
  return baseSvg((fill, c) => `
    <path d="M18 50 H46 Q48 50 48 48 L46 40 Q32 44 18 40 L16 48 Q16 50 18 50Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M22 40 Q32 20 42 40Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="32" cy="22" r="11" fill="${fill}" stroke="#2c2a26" stroke-width="2.4"/>
    <path d="M32 6 V14 M28 10 H36" stroke="#2c2a26" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="32" cy="6" r="2.2" fill="${shade(c, 70)}" stroke="#2c2a26" stroke-width="1.5"/>
    ${face(32, 22)}
  `, { size, color, title: '國王', bounce });
}

function drawKnight(color, size, bounce) {
  return baseSvg((fill) => `
    <path d="M18 50 H46 Q48 50 48 48 L45 42 Q32 46 20 42 L16 48 Q16 50 18 50Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M22 44 C20 30 28 18 38 14 C42 12 46 14 44 20 C48 22 48 30 42 34 L40 44Z"
      fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M34 16 Q30 10 26 14" fill="none" stroke="#2c2a26" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="36" cy="22" r="2.4" fill="#2c2a26"/>
    <circle cx="36.7" cy="21.3" r="0.7" fill="#fff"/>
    <ellipse cx="40" cy="28" rx="3" ry="2" fill="#ff8fab" opacity=".5"/>
    <path d="M30 30 Q34 33 38 30" fill="none" stroke="#2c2a26" stroke-width="1.5" stroke-linecap="round"/>
  `, { size, color, title: '騎士', bounce });
}

function drawRook(color, size, bounce) {
  return baseSvg((fill) => `
    <path d="M18 50 H46 Q48 50 48 48 L46 42 H18 L16 48 Q16 50 18 50Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="22" y="22" width="20" height="22" rx="3" fill="${fill}" stroke="#2c2a26" stroke-width="2.4"/>
    <path d="M18 22 H46 V14 H40 V18 H35 V14 H29 V18 H24 V14 H18 Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    ${face(32, 30)}
  `, { size, color, title: '城堡', bounce });
}

function drawQueen(color, size, bounce) {
  return baseSvg((fill, c) => `
    <path d="M18 50 H46 Q48 50 48 48 L46 40 Q32 44 18 40 L16 48 Q16 50 18 50Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M20 40 L16 18 L24 28 L32 12 L40 28 L48 18 L44 40Z" fill="${fill}" stroke="#2c2a26" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="16" cy="16" r="2.4" fill="${shade(c, 70)}" stroke="#2c2a26" stroke-width="1.5"/>
    <circle cx="32" cy="10" r="2.6" fill="${shade(c, 70)}" stroke="#2c2a26" stroke-width="1.5"/>
    <circle cx="48" cy="16" r="2.4" fill="${shade(c, 70)}" stroke="#2c2a26" stroke-width="1.5"/>
    <circle cx="32" cy="28" r="9" fill="${fill}" stroke="#2c2a26" stroke-width="2"/>
    ${face(32, 28)}
  `, { size, color, title: '皇后', bounce });
}

const DRAWERS = {
  king: drawKing,
  knight: drawKnight,
  rook: drawRook,
  queen: drawQueen,
};

/**
 * @param {{ piece?: string, color: string, name?: string }} player
 * @param {{ size?: number, bounce?: boolean, className?: string }} [opts]
 */
export function renderPiece(player, opts = {}) {
  const { size = 36, bounce = false, className = '' } = opts;
  const pieceId = player.piece || pieceForIndex(0).id;
  const def = PIECE_DEFS.find(p => p.id === pieceId) || PIECE_DEFS[0];
  const drawer = DRAWERS[def.id] || drawKing;
  const color = player.color || '#888888';
  const svg = drawer(color, size, bounce);
  const wrap = document.createElement('span');
  wrap.className = `piece-wrap ${className}`.trim();
  wrap.title = `${player.name || ''}（${def.title}）`.trim();
  wrap.dataset.piece = def.id;
  wrap.dataset.teamColor = color;
  wrap.appendChild(svg);
  return wrap;
}

export function assignPieces(players) {
  return players.map((p, i) => ({
    ...p,
    piece: p.piece || pieceForIndex(i).id,
    color: p.color || TEAM_COLORS[i] || TEAM_COLORS[0],
  }));
}
