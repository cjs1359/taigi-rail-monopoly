/** Render monopoly-style ring board as SVG */

export function renderBoardSvg(board, players, { width = 640, height = 640 } = {}) {
  const n = board.squares.length;
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.min(width, height) * 0.46;
  const inner = outer * 0.72;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'board-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '環島棋盤');

  // soft ring background
  const ring = document.createElementNS(svgNS, 'circle');
  ring.setAttribute('cx', cx);
  ring.setAttribute('cy', cy);
  ring.setAttribute('r', (outer + inner) / 2);
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#e8dfc8');
  ring.setAttribute('stroke-width', outer - inner);
  svg.appendChild(ring);

  const positions = [];
  for (let i = 0; i < n; i++) {
    // counter-clockwise from top (-90deg), going left first visually = west
    const angle = -Math.PI / 2 - (i / n) * Math.PI * 2;
    const r = (outer + inner) / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    positions.push({ x, y, angle });
  }

  board.squares.forEach((sq, i) => {
    const { x, y, angle } = positions[i];
    const g = document.createElementNS(svgNS, 'g');
    const w = Math.max(36, Math.min(56, (2 * Math.PI * ((outer + inner) / 2)) / n * 0.85));
    const h = outer - inner;
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', -w / 2);
    rect.setAttribute('y', -h / 2);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', 6);
    const fill = sq.type === 'station' ? (sq.color || '#7A8B6B')
      : sq.type === 'start' ? '#c4a35a'
      : sq.type === 'branch' ? '#9B6B9B'
      : sq.type === 'lore' ? '#4A90A4'
      : sq.type === 'rest' ? '#8B6B4A'
      : '#aaa';
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', '#fff');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('opacity', '0.92');
    g.appendChild(rect);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('class', 'sq-label');
    label.setAttribute('fill', '#fff');
    const displayLabel = sq.type === 'branch' && sq.branchName ? sq.branchName : sq.label;
    const fontSize = displayLabel.length > 5 ? 8 : displayLabel.length > 3 ? 9 : 10;
    label.setAttribute('font-size', String(fontSize));
    const lines = wrapLabel(displayLabel, 5);
    lines.forEach((line, li) => {
      const tspan = document.createElementNS(svgNS, 'tspan');
      tspan.setAttribute('x', 0);
      tspan.setAttribute('dy', li === 0 ? `${-((lines.length - 1) * 0.55)}em` : '1.1em');
      tspan.textContent = line;
      label.appendChild(tspan);
    });
    g.appendChild(label);

    const deg = (angle * 180) / Math.PI + 90;
    g.setAttribute('transform', `translate(${x}, ${y}) rotate(${deg})`);
    svg.appendChild(g);
  });

  // player tokens
  const byPos = new Map();
  players.forEach((p, idx) => {
    if (p.bankrupt) return;
    const list = byPos.get(p.position) || [];
    list.push({ p, idx });
    byPos.set(p.position, list);
  });
  for (const [pos, list] of byPos) {
    const { x, y } = positions[pos];
    list.forEach(({ p }, j) => {
      const offset = (j - (list.length - 1) / 2) * 12;
      const tx = x + Math.cos(positions[pos].angle + Math.PI / 2) * offset * 0.15;
      const ty = y + offset * 0.35;
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', tx);
      c.setAttribute('cy', ty);
      c.setAttribute('r', 8);
      c.setAttribute('fill', p.color);
      c.setAttribute('class', 'token');
      svg.appendChild(c);
    });
  }

  return { svg, positions };
}

function wrapLabel(text, max) {
  const s = String(text);
  if (s.length <= max) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out.slice(0, 3);
}
