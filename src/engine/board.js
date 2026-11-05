export const LINE_COLORS = Object.freeze(Object.fromEntries([
  ['縱貫線(北段)', '#5B8C5A'], ['海岸線', '#4A90A4'], ['臺中線', '#C4A35A'],
  ['縱貫線(南段)', '#6B8E23'], ['屏東線', '#D4A017'], ['南迴線', '#C75B39'],
  ['臺東線', '#8B6B4A'], ['北迴線', '#3D7A6A'], ['宜蘭線', '#5A7A9A'],
  ['深澳/平溪線', '#9B6B9B'], ['內灣/六家線', '#7A9B6B'], ['集集線', '#B8860B'],
  ['沙崙線', '#708090'], ['林務局・阿里山森林鐵路', '#2E8B57'],
]));

export function buildBoard(stations, selectedIds) {
  const stationById = new Map(stations.map(s => [s.id, s]));
  const selected = [...new Set(selectedIds)].map(id => {
    if (!stationById.has(id)) throw new Error(`未知車站：${id}`);
    return stationById.get(id);
  });
  const threshold = stations.find(s => ['臺北', '台北'].includes(s.mandarin))?.lineOrder ?? 14;
  const north = '縱貫線(北段)', south = '縱貫線(南段)';
  const ordered = [];
  const group = (line, predicate = () => true) => {
    ordered.push(...selected.filter(s => s.line === line && predicate(s))
      .sort((a, b) => a.lineOrder - b.lineOrder || a.id.localeCompare(b.id))
      .map(s => ({ type: 'station', id: s.id, stationId: s.id, label: s.mandarin,
        line: s.line, color: LINE_COLORS[s.line] ?? '#7A8B6B' })));
  };
  const branch = (line, branchName) => {
    if (!selected.some(s => s.line === line)) return;
    ordered.push({ type: 'branch', id: `branch:${line}`, label: '支線', branchName });
    group(line);
  };
  const junction = name => stations.find(s => s.line === south && s.mandarin === name)?.lineOrder;
  const chiayi = junction('嘉義') ?? 17, tainan = junction('臺南') ?? 31;
  group(north, s => s.lineOrder >= threshold);
  branch('內灣/六家線', '內灣支線');
  group('海岸線'); group('臺中線'); branch('集集線', '集集支線');
  group(south, s => s.lineOrder <= chiayi);
  branch('林務局・阿里山森林鐵路', '阿里山支線');
  group(south, s => s.lineOrder > chiayi && s.lineOrder <= tainan);
  branch('沙崙線', '沙崙支線'); branch('臺灣糖業', '支線');
  group(south, s => s.lineOrder > tainan);
  for (const line of ['屏東線', '南迴線', '臺東線', '北迴線', '宜蘭線']) group(line);
  branch('林務局・蹦蹦車', '支線');
  group(north, s => s.lineOrder < threshold);
  branch('深澳/平溪線', '平溪支線'); branch('林務局・烏來台車', '支線');
  const known = new Set([...Object.keys(LINE_COLORS), '臺灣糖業', '林務局・蹦蹦車', '林務局・烏來台車']);
  for (const line of [...new Set(selected.map(s => s.line))].filter(l => !known.has(l))) branch(line, '支線');
  const count = selected.length;
  const loreCount = count >= 6 ? Math.max(count >= 12 ? 2 : 1, Math.floor(count / 7)) : 0;
  const restCount = count >= 24 ? 2 : count >= 10 ? 1 : 0;
  const squares = [{ type: 'start', id: 'start', label: '起點' }];
  let seen = 0, lore = 0, rest = 0;
  for (const square of ordered) {
    squares.push(square);
    if (square.type !== 'station') continue;
    seen++;
    if (lore < loreCount && seen >= Math.round((lore + 1) * count / (loreCount + 1))) {
      squares.push({ type: 'lore', id: `lore:${++lore}`, label: '地名典故卡' });
    }
    if (rest < restCount && seen >= Math.round((rest + 1) * count / (restCount + 1))) {
      squares.push({ type: 'rest', id: `rest:${++rest}`, label: '月台休息' });
    }
  }
  return { squares, stationById };
}
