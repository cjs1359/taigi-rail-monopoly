export const MAX_BOARD_SQUARES = 40;
export const RECOMMENDED_STATION_MIN = 16;
export const RECOMMENDED_STATION_MAX = 32;

export const LINE_COLORS = Object.freeze(Object.fromEntries([
  ['縱貫線(北段)', '#5B8C5A'], ['海岸線', '#4A90A4'], ['臺中線', '#C4A35A'],
  ['縱貫線(南段)', '#6B8E23'], ['屏東線', '#D4A017'], ['南迴線', '#C75B39'],
  ['臺東線', '#8B6B4A'], ['北迴線', '#3D7A6A'], ['宜蘭線', '#5A7A9A'],
  ['深澳/平溪線', '#9B6B9B'], ['內灣/六家線', '#7A9B6B'], ['集集線', '#B8860B'],
  ['沙崙線', '#708090'], ['林務局・阿里山森林鐵路', '#2E8B57'],
]));

const BRANCH_LABEL = Object.freeze({
  '內灣/六家線': '內灣支線',
  '集集線': '集集支線',
  '林務局・阿里山森林鐵路': '阿里山支線',
  '沙崙線': '沙崙支線',
  '深澳/平溪線': '平溪支線',
  '林務局・烏來台車': '烏來支線',
  '林務局・蹦蹦車': '太平山支線',
  '臺灣糖業': '糖鐵支線',
});

/** Planned/abolished stations → approximate junction region key. */
const PLANNED_REGION = Object.freeze({
  '六堵': 'keelung',
  '北五堵': 'keelung',
  '樟樹灣': 'keelung',
  '鳳鳴': 'taoyuan',
  '林森': 'tainan',
  '武荖坑': 'yilan',
  '月美': 'southLink',
  '古莊': 'southLink',
  '多良': 'southLink',
  '第一分道': 'southLink',
});

function asc(a, b) {
  return a.lineOrder - b.lineOrder || a.id.localeCompare(b.id);
}
function sorted(list, reverse = false) {
  const out = [...list].sort(asc);
  return reverse ? out.reverse() : out;
}
function lineOf(stations, name) {
  return stations.filter(s => s.line === name);
}
function taipeiThreshold(stations) {
  return stations.find(s => ['臺北', '台北'].includes(s.mandarin))?.lineOrder ?? 11;
}

/**
 * Canonical round-island order over the full catalog (臺北出發順時針環島：
 * 西下車→中南部→屏東南迴→臺東線北上→北迴→宜蘭回基隆→回臺北)。
 * Branch / planned stations are inserted at their junction region.
 */
export function canonicalStationOrder(stations) {
  const thr = taipeiThreshold(stations);
  const north = lineOf(stations, '縱貫線(北段)');
  const south = lineOf(stations, '縱貫線(南段)');
  const planned = lineOf(stations, '預定新站及裁撤站');
  const byRegion = (key) => sorted(planned.filter(s => PLANNED_REGION[s.mandarin] === key));

  const out = [];
  const push = (list) => { out.push(...list); };
  const pushAfter = (predicate, list) => {
    if (!list.length) return;
    const idx = out.findIndex(predicate);
    if (idx < 0) {
      out.push(...list);
      return;
    }
    out.splice(idx + 1, 0, ...list);
  };

  // --- 1. 縱貫北段：臺北→竹南（含臺北）---
  const northSouth = sorted(north.filter(s => s.lineOrder >= thr));
  push(northSouth);

  // 烏來：臺北近郊 → 插在板橋之後（或臺北後）
  pushAfter(
    s => s.mandarin === '板橋' || s.mandarin === '臺北' || s.mandarin === '台北',
    sorted(lineOf(stations, '林務局・烏來台車')),
  );
  // 鳳鳴（鶯歌／桃園一帶預定）
  pushAfter(s => s.mandarin === '鶯歌' || s.mandarin === '桃園', byRegion('taoyuan'));

  // 內灣／六家：新竹／竹北 ---
  pushAfter(
    s => s.mandarin === '新竹' || s.mandarin === '北新竹' || s.mandarin === '竹北',
    sorted(lineOf(stations, '內灣/六家線')),
  );

  // --- 2. 海岸線＋臺中線（竹南→彰化，同段並置：先海線再山線）---
  push(sorted(lineOf(stations, '海岸線')));
  push(sorted(lineOf(stations, '臺中線')));

  // --- 3. 縱貫南段 彰化→高雄，支線就近插入 ---
  const southAll = sorted(south);
  const erShui = southAll.findIndex(s => s.mandarin === '二水');
  const chiayi = southAll.findIndex(s => s.mandarin === '嘉義');
  const zhongzhou = southAll.findIndex(s => s.mandarin === '中洲');
  const tainan = southAll.findIndex(s => s.mandarin === '臺南' || s.mandarin === '台南');

  const cut = (from, to) => southAll.slice(from, to);

  // 彰化→二水
  const i0 = 0;
  const iEr = erShui >= 0 ? erShui + 1 : Math.max(1, Math.floor(southAll.length * 0.15));
  push(cut(i0, iEr));
  push(sorted(lineOf(stations, '集集線'))); // 二水／集集

  // 二水後→嘉義
  const iChia = chiayi >= 0 ? chiayi + 1 : Math.max(iEr, Math.floor(southAll.length * 0.4));
  push(cut(iEr, iChia));
  push(sorted(lineOf(stations, '林務局・阿里山森林鐵路')));
  // 糖鐵大致在嘉義／南投一帶
  push(sorted(lineOf(stations, '臺灣糖業')));

  // 嘉義後→中洲
  const iZhong = zhongzhou >= 0 ? zhongzhou + 1 : Math.max(iChia, Math.floor(southAll.length * 0.75));
  push(cut(iChia, iZhong));
  push(sorted(lineOf(stations, '沙崙線'))); // 中洲／沙崙
  pushAfter(s => s.mandarin === '臺南' || s.mandarin === '台南' || s.mandarin === '中洲', byRegion('tainan'));

  // 中洲後→高雄
  push(cut(iZhong, southAll.length));

  // --- 4. 屏東→南迴（向東）---
  push(sorted(lineOf(stations, '屏東線')));
  push(sorted(lineOf(stations, '南迴線'))); // 加祿→康樂（枋寮→臺東方向）
  push(byRegion('southLink'));

  // --- 5. 臺東線北上：臺東→花蓮（PDF lineOrder 為吉安→臺東，故反轉）---
  push(sorted(lineOf(stations, '臺東線'), true));

  // --- 6. 北迴：花蓮→蘇澳（PDF 永樂→花蓮，故反轉）---
  push(sorted(lineOf(stations, '北迴線'), true));

  // --- 7. 宜蘭線：蘇澳→暖暖／八堵方向（PDF 暖暖→蘇澳，故反轉）---
  const yilan = sorted(lineOf(stations, '宜蘭線'), true);
  const yilanCity = yilan.findIndex(s => s.mandarin === '宜蘭' || s.mandarin === '羅東');
  if (yilanCity >= 0) {
    push(yilan.slice(0, yilanCity + 1));
    push(sorted(lineOf(stations, '林務局・蹦蹦車'))); // 太平山近宜蘭
    push(byRegion('yilan'));
    push(yilan.slice(yilanCity + 1));
  } else {
    push(yilan);
    push(sorted(lineOf(stations, '林務局・蹦蹦車')));
    push(byRegion('yilan'));
  }

  // 平溪／深澳：宜蘭線末端（瑞芳／三貂嶺／暖暖）之後、基隆回程之前
  const pingxiAnchor = ['三貂嶺', '瑞芳', '猴硐', '暖暖']
    .map(n => out.findIndex(s => s.mandarin === n))
    .filter(i => i >= 0);
  const pingxiStations = sorted(lineOf(stations, '深澳/平溪線'));
  if (pingxiAnchor.length) {
    out.splice(Math.max(...pingxiAnchor) + 1, 0, ...pingxiStations);
  } else {
    push(pingxiStations);
  }

  // --- 8. 縱貫北段東側回臺北：基隆→南港／松山（lineOrder < 臺北，由北向南＝order 升冪）---
  push(sorted(north.filter(s => s.lineOrder < thr)));
  push(byRegion('keelung'));

  // Any catalog station still missing (safety net) — append in catalog order
  const seen = new Set(out.map(s => s.id));
  for (const s of stations) {
    if (!seen.has(s.id)) out.push(s);
  }
  return out;
}

/** tripIndex map: stationId → 0..n-1 in canonical order */
export function canonicalTripIndex(stations) {
  const order = canonicalStationOrder(stations);
  const map = new Map();
  order.forEach((s, i) => map.set(s.id, i));
  return map;
}

function toStationSquare(s) {
  return {
    type: 'station',
    id: s.id,
    stationId: s.id,
    label: s.mandarin,
    taigiTl: s.taigiTl || '',
    line: s.line,
    color: LINE_COLORS[s.line] ?? '#7A8B6B',
  };
}

const MAIN_RING_LINES = new Set([
  '縱貫線(北段)', '海岸線', '臺中線', '縱貫線(南段)',
  '屏東線', '南迴線', '臺東線', '北迴線', '宜蘭線',
]);

function orderStations(stations, selected) {
  const selectedSet = new Set(selected.map(s => s.id));
  const canon = canonicalStationOrder(stations).filter(s => selectedSet.has(s.id));
  const ordered = [];
  const opened = new Set();
  for (const s of canon) {
    if (!MAIN_RING_LINES.has(s.line) && !opened.has(s.line)) {
      opened.add(s.line);
      ordered.push({
        type: 'branch',
        id: `branch:${s.line}`,
        label: '支線',
        branchName: BRANCH_LABEL[s.line] || '支線',
      });
    }
    ordered.push(toStationSquare(s));
  }
  return ordered;
}

function specialCounts(stationCount, budget) {
  let lore = stationCount >= 6 ? Math.max(stationCount >= 12 ? 2 : 1, Math.floor(stationCount / 8)) : 0;
  let rest = stationCount >= 24 ? 2 : stationCount >= 10 ? 1 : 0;
  lore = Math.min(lore, 3);
  while (lore + rest > budget && lore > 0) lore--;
  while (lore + rest > budget && rest > 0) rest--;
  return { loreCount: lore, restCount: rest };
}

function assembleSquares(ordered, stationCount) {
  const branchCount = ordered.filter(s => s.type === 'branch').length;
  const fixed = 1 + ordered.length;
  const budget = Math.max(0, MAX_BOARD_SQUARES - fixed);
  const { loreCount, restCount } = specialCounts(stationCount, budget);
  const squares = [{ type: 'start', id: 'start', label: '起點' }];
  let seen = 0, lore = 0, rest = 0;
  for (const square of ordered) {
    squares.push(square);
    if (square.type !== 'station') continue;
    seen++;
    if (lore < loreCount && seen >= Math.round((lore + 1) * stationCount / (loreCount + 1))) {
      squares.push({ type: 'lore', id: `lore:${++lore}`, label: '地名典故卡' });
    }
    if (rest < restCount && seen >= Math.round((rest + 1) * stationCount / (restCount + 1))) {
      squares.push({ type: 'rest', id: `rest:${++rest}`, label: '月台休息' });
    }
  }
  return { squares, branchCount, loreCount, restCount };
}

function resolveSelected(stations, selectedIds) {
  const stationById = new Map(stations.map(s => [s.id, s]));
  const selected = [...new Set(selectedIds)].map(id => {
    if (!stationById.has(id)) throw new Error(`未知車站：${id}`);
    return stationById.get(id);
  });
  return { stationById, selected };
}

export function previewBoard(stations, selectedIds) {
  const { selected } = resolveSelected(stations, selectedIds);
  const ordered = orderStations(stations, selected);
  const { squares, branchCount, loreCount, restCount } = assembleSquares(ordered, selected.length);
  return {
    squareCount: squares.length,
    stationCount: selected.length,
    branchCount,
    loreCount,
    restCount,
    overCap: squares.length > MAX_BOARD_SQUARES,
    maxSquares: MAX_BOARD_SQUARES,
  };
}

export function sampleStationsToFit(stations, selectedIds, rng = Math.random) {
  let ids = [...new Set(selectedIds)];
  const byId = new Map(stations.map(s => [s.id, s]));
  while (ids.length > 0 && previewBoard(stations, ids).overCap) {
    const nonDiff = ids.filter(id => !byId.get(id)?.differs);
    const pool = nonDiff.length ? nonDiff : ids;
    const pick = pool[Math.floor(rng() * pool.length)];
    ids = ids.filter(id => id !== pick);
  }
  return ids;
}

/**
 * Classify a station into a coarse geography bucket for side labels.
 */
export function regionOfStation(station, stations) {
  const thr = taipeiThreshold(stations);
  const line = station.line;
  if (line === '宜蘭線' || line === '林務局・蹦蹦車') return '宜蘭';
  if (line === '北迴線' || line === '臺東線') return '東部';
  if (line === '屏東線' || line === '南迴線') return '南部';
  if (line === '海岸線' || line === '臺中線' || line === '集集線') return '中部';
  if (line === '縱貫線(南段)') {
    if (station.lineOrder <= 8) return '中部'; // ~彰化–二水
    if (station.lineOrder >= 40) return '南部'; // 近高雄
    return '南部';
  }
  if (line === '縱貫線(北段)') {
    if (station.lineOrder < thr) return '北部';
    if (station.lineOrder <= 18) return '北部'; // 臺北–桃園
    if (station.lineOrder <= 31) return '西部'; // 新竹一帶
    return '中部'; // 竹南
  }
  if (line === '深澳/平溪線') return '北部';
  if (line === '內灣/六家線' || line === '沙崙線' || line === '林務局・阿里山森林鐵路') return '西部';
  if (line === '林務局・烏來台車') return '北部';
  if (line === '臺灣糖業') return '中部';
  if (line === '預定新站及裁撤站') {
    const r = PLANNED_REGION[station.mandarin];
    if (r === 'keelung') return '北部';
    if (r === 'yilan') return '宜蘭';
    if (r === 'tainan' || r === 'southLink') return '南部';
    if (r === 'taoyuan') return '北部';
  }
  return '環島';
}

/** Build short Traditional Chinese labels for the four board sides from stations on them. */
export function labelsForSides(sideStations, stations) {
  const rank = ['北部', '西部', '中部', '南部', '東部', '宜蘭', '環島'];
  return sideStations.map(list => {
    if (!list.length) return '';
    const counts = new Map();
    for (const s of list) {
      const r = regionOfStation(s, stations);
      counts.set(r, (counts.get(r) || 0) + 1);
    }
    const ranked = [...counts.entries()]
      .filter(([k]) => k !== '環島')
      .sort((a, b) => b[1] - a[1] || rank.indexOf(a[0]) - rank.indexOf(b[0]));
    if (!ranked.length) return '';
    if (ranked.length === 1) return ranked[0][0];
    // up to two labels, e.g. 北部・宜蘭
    return ranked.slice(0, 2).map(([k]) => k).join('・');
  });
}

export function buildBoard(stations, selectedIds) {
  const { stationById, selected } = resolveSelected(stations, selectedIds);
  const ordered = orderStations(stations, selected);
  const { squares } = assembleSquares(ordered, selected.length);
  if (squares.length > MAX_BOARD_SQUARES) {
    throw new Error(
      `棋盤超過 ${MAX_BOARD_SQUARES} 格上限（目前 ${squares.length} 格，含 ${selected.length} 站）。請減少車站或使用「縮減到上限」。`,
    );
  }
  return { squares, stationById };
}
