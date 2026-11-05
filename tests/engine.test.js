import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBoard, previewBoard, sampleStationsToFit, MAX_BOARD_SQUARES,
  canonicalStationOrder, canonicalTripIndex,
  generateBuyQuestion, generateRentQuestion, checkAnswer,
  buildLoreDeck, drawLoreCard, createGame, rollDice, answerBuy, answerRent, ack,
  forceEnd, STATION_PRICE, BASE_RENT } from '../src/engine/index.js';

const stations = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const byName = name => stations.find(s => s.mandarin === name);
const players = [{ id: 'a', name: '阿明', color: 'red' }, { id: 'b', name: '阿華', color: 'blue' }];
const selectedIds = stations.slice(0, 28).map(s => s.id);
const make = (config = {}) => createGame({ stations, selectedIds, players, rng: () => 0, now: () => 0, ...config });
const wrongIndex = q => (q.answerIndex + 1) % 4;
// Position the active player one step before a square to test individual landings.
function before(state, square, playerIndex = state.currentPlayerIndex) {
  const index = state.board.squares.findIndex(square);
  if (index < 0) throw new Error('Missing test square');
  return { ...state, phase: 'await_roll', pending: null, currentPlayerIndex: playerIndex,
    players: state.players.map((p, i) => i === playerIndex ? { ...p,
      position: (index - 1 + state.board.squares.length) % state.board.squares.length } : p) };
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('board', () => {
  it('follows the counter-clockwise ring using the catalog Taipei threshold', () => {
    const names = ['基隆', '宜蘭', '臺東', '高雄', '臺北', '新竹'];
    const ids = names.map(n => byName(n).id);
    const board = buildBoard(stations, ids);
    expect(board.squares[0]).toEqual({ type: 'start', id: 'start', label: '起點' });
    expect(board.squares.filter(s => s.type === 'station').map(s => s.label))
      .toEqual(['臺北', '新竹', '高雄', '臺東', '宜蘭', '基隆']);
    expect(board.stationById.size).toBe(stations.length);
  });
  it('clusters branches behind one branch square in the junction region', () => {
    const lines = ['深澳/平溪線', '內灣/六家線', '集集線', '沙崙線', '林務局・阿里山森林鐵路',
      '林務局・烏來台車', '林務局・蹦蹦車', '臺灣糖業', '預定新站及裁撤站'];
    const ids = [...lines.flatMap(line => stations.filter(s => s.line === line).slice(0, 2).map(s => s.id)),
      ...['臺北', '新竹', '嘉義', '臺南', '基隆'].map(n => byName(n).id)];
    const squares = buildBoard(stations, ids).squares;
    expect(squares.filter(s => s.type === 'branch')).toHaveLength(lines.length);
    for (const line of lines) {
      const index = squares.findIndex(s => s.id === `branch:${line}`);
      expect(squares[index + 1].line).toBe(line);
    }
    const pingxi = squares.findIndex(s => s.branchName === '平溪支線');
    const keelung = squares.findIndex(s => s.label === '基隆');
    const hsinchu = squares.findIndex(s => s.label === '新竹');
    // 平溪在宜蘭線末端／八堵一帶，應在西部新竹之後、基隆回程附近（不大於基隆之後很遠）
    expect(pingxi).toBeGreaterThan(hsinchu);
    expect(pingxi).toBeLessThan(keelung);
  });
  it.each([[5, 0, 0], [6, 1, 0], [12, 2, 1], [24, 3, 2], [32, 3, 2]])(
    'adapts specials for %i stations', (count, lore, rest) => {
      const squares = buildBoard(stations, stations.slice(0, count).map(s => s.id)).squares;
      expect(squares.filter(s => s.type === 'station')).toHaveLength(count);
      expect(squares.filter(s => s.type === 'lore')).toHaveLength(lore);
      expect(squares.filter(s => s.type === 'rest')).toHaveLength(rest);
      expect(squares.length).toBeLessThanOrEqual(MAX_BOARD_SQUARES);
      expect(new Set(squares.map(s => s.id)).size).toBe(squares.length);
    });
  it('caps the board and can sample a large selection down to fit', () => {
    const differs = stations.filter(s => s.differs).map(s => s.id);
    const preview = previewBoard(stations, differs);
    expect(preview.overCap).toBe(true);
    expect(() => buildBoard(stations, differs)).toThrow(/40/);
    const trimmed = sampleStationsToFit(stations, differs, () => 0.25);
    const after = previewBoard(stations, trimmed);
    expect(after.overCap).toBe(false);
    expect(after.squareCount).toBeLessThanOrEqual(MAX_BOARD_SQUARES);
    expect(buildBoard(stations, trimmed).squares.length).toBeLessThanOrEqual(MAX_BOARD_SQUARES);
  });
  it('preserves aliases, deduplicates selections, validates ids and uses fallback threshold', () => {
    const alias = stations.find(s => /[（(]/.test(s.mandarin));
    if (alias) expect(buildBoard(stations, [alias.id, alias.id]).squares[1].label).toBe(alias.mandarin);
    expect(() => buildBoard(stations, ['missing'])).toThrow();
    const catalog = [
      { id: 'tp', line: '縱貫線(北段)', lineOrder: 14, mandarin: '臺北' },
      { id: 'north', line: '縱貫線(北段)', lineOrder: 13, mandarin: '北' },
      { id: 'south', line: '縱貫線(北段)', lineOrder: 15, mandarin: '南' },
    ];
    // 南下：臺北→南；回程：北
    expect(buildBoard(catalog, ['north', 'south', 'tp']).squares.filter(s => s.type === 'station').map(s => s.id))
      .toEqual(['tp', 'south', 'north']);
  });

  it('keeps 臺北 → 高雄 → 花蓮 → 宜蘭 in cyclic trip order', () => {
    const names = ['臺北', '高雄', '花蓮', '宜蘭'];
    const board = buildBoard(stations, names.map(n => byName(n).id));
    const labels = board.squares.filter(s => s.type === 'station').map(s => s.label);
    expect(labels).toEqual(names);
    const canon = canonicalStationOrder(stations);
    const idx = names.map(n => canon.findIndex(s => s.mandarin === n));
    expect(idx.every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true);
  });

  it('board station order follows the canonical sequence for random selections', () => {
    const trip = canonicalTripIndex(stations);
    for (let seed = 1; seed <= 8; seed++) {
      let x = seed * 17;
      const rng = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return (x % 1000) / 1000; };
      const shuffled = [...stations].sort(() => rng() - 0.5);
      const pick = shuffled.slice(0, 12 + (seed % 10)).map(s => s.id);
      const labels = buildBoard(stations, pick).squares
        .filter(s => s.type === 'station')
        .map(s => s.stationId);
      const trips = labels.map(id => trip.get(id));
      for (let i = 1; i < trips.length; i++) {
        expect(trips[i]).toBeGreaterThan(trips[i - 1]);
      }
    }
  });
});

describe('questions and lore', () => {
  it('produces four unique shuffled options and reveals from actual data', () => {
    for (const s of stations) {
      const q = generateBuyQuestion(s, stations, () => 0.4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answerIndex]).toBe(s.taigiTl);
      expect(checkAnswer(q, q.answerIndex)).toBe(true);
      expect(checkAnswer(q, -1)).toBe(false);
      expect(checkAnswer(q, '0')).toBe(false);
      expect(q.reveal.taigiNote).toBe(s.taigiNote);
    }
  });
  it('uses hanji when appropriate and tl otherwise, deterministically', () => {
    const s = stations.find(s => s.differs && s.taigiHanji);
    const q = generateRentQuestion(s, stations, () => 0);
    expect(q.kind).toBe('rent-hanji');
    expect(q.options[q.answerIndex]).toBe(s.taigiHanji);
    expect(new Set(q.options).size).toBe(4);
    expect(q).toEqual(generateRentQuestion(s, stations, () => 0));
    expect(generateRentQuestion(byName('臺北'), stations).kind).toBe('rent-tl');
    expect(() => generateBuyQuestion(s, [s])).toThrow();
  });
  it('prefers shared syllables or line over unrelated distractors', () => {
    const catalog = [
      { id: 'a', mandarin: '甲', taigiTl: 'Tâi-pak', line: 'a' },
      { id: 'b', taigiTl: 'Tâi-lâm', line: 'b' },
      { id: 'c', taigiTl: 'Pak-mn̂g', line: 'b' },
      { id: 'd', taigiTl: 'Other', line: 'a' },
      { id: 'e', taigiTl: 'Unrelated', line: 'b' },
    ];
    expect(generateBuyQuestion(catalog[0], catalog, () => 0).options).not.toContain('Unrelated');
  });
  it('builds cards exclusively from supplied fields and cycles safely', () => {
    const deck = buildLoreDeck(stations, stations.map(s => s.id), () => 0);
    expect(deck.length).toBeGreaterThan(0);
    for (const card of deck) {
      const s = stations.find(s => s.id === card.stationId);
      expect(card.body).toBe([s.taigiHanji && `「${s.mandarin}」台語建議漢字寫作「${s.taigiHanji}」。`,
        s.taigiNote, s.taigiAlt && `又音：${s.taigiAlt}`].filter(Boolean).join('\n'));
    }
    expect(drawLoreCard(deck, deck.length)).toBe(deck[0]);
    expect(drawLoreCard([], 0)).toBeNull();
    expect(buildLoreDeck(stations, [])).toEqual([]);
  });
});

describe('game state machine', () => {
  it('plays correct purchase, incorrect purchase and half-rent, tracking answers', () => {
    let state = make();
    state = rollDice(state);
    expect(state.phase).toBe('await_buy_answer');
    const id = state.pending.square.stationId;
    state = answerBuy(state, state.pending.question.answerIndex);
    expect(state.players[0].properties).toEqual([id]);
    expect(state.players[0].cash).toBe(1300);
    expect(state.currentPlayerIndex).toBe(1);
    state = rollDice(before(state, s => s.type === 'station' && s.stationId !== id));
    state = answerBuy(state, wrongIndex(state.pending.question));
    expect(state.players[1].properties).toEqual([]);
    expect(state.players[1].wrong).toHaveLength(1);
    state = rollDice(before(state, s => s.stationId === id, 1));
    expect(state.phase).toBe('await_rent_answer');
    state = answerRent(state, state.pending.question.answerIndex);
    expect(state.players[1].cash).toBe(1500 - Math.ceil(BASE_RENT / 2));
    expect(state.players[0].cash).toBe(1325);
    expect(state.players[1].correct).toBe(1);
    expect(forceEnd(state).winnerRanking.find(p => p.id === 'b').wrongAnswers).toHaveLength(1);
  });
  it('handles rest skipping, lore and branch bonuses', () => {
    const branchId = stations.find(s => s.line === '深澳/平溪線').id;
    let state = make({ selectedIds: [...selectedIds, branchId] });
    state = rollDice(before(state, s => s.type === 'rest'));
    expect(state.players[0].skipped).toBe(true);
    state = ack(state);
    expect(state.currentPlayerIndex).toBe(1);
    state = ack(rollDice(before(state, s => s.type === 'branch')));
    expect(state.players[1].cash).toBe(1600);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.players[0].skipped).toBe(false);
    state = rollDice(before(state, s => s.type === 'lore'));
    expect(state.phase).toBe('await_lore');
    expect(state.pending.card).toEqual(state.loreDeck[0]);
    expect(state.players[1].cash).toBe(1630);
    expect(state.loreIndex).toBe(1);
    expect(ack(state).phase).toBe('await_roll');
  });
  it('ends on time after resolution and ranks assets then correct answers', () => {
    let time = 0;
    let state = make({ now: () => time, timeLimitMin: 1 });
    state = rollDice(state);
    time = 60000;
    expect(state.phase).toBe('await_buy_answer');
    state = answerBuy(state, state.pending.question.answerIndex);
    expect(state.phase).toBe('ended');
    expect(state.winnerRanking[0].id).toBe('a');
    expect(state.winnerRanking[0].totalAssets).toBe(1500);
    expect(state.winnerRanking[0].correct).toBe(1);
    expect(rollDice(state)).toBe(state);
    expect(forceEnd(state)).toBe(state);
    expect(ack(state)).toBe(state);
  });
  it('transfers remaining cash and properties to creditor on bankruptcy', () => {
    let state = make();
    const [first, second] = state.board.squares.filter(s => s.type === 'station');
    state.players[0].properties = [first.stationId];
    state.players[1].properties = [second.stationId];
    state.players[1].cash = 10;
    state = rollDice(before(state, s => s.stationId === first.stationId, 1));
    state = answerRent(state, wrongIndex(state.pending.question));
    expect(state.players[1]).toMatchObject({ cash: 0, properties: [], bankrupt: true });
    expect(state.players[0].properties).toEqual([first.stationId, second.stationId]);
    expect(state.players[0].cash).toBe(1510);
    expect(state.phase).toBe('ended');
    expect(state.winnerRanking[1].wrongAnswers[0].kind).toMatch(/^rent-/);
  });
  it('skips bankrupt players while others remain, and handles exact rent payment', () => {
    let state = make({ players: [...players, { id: 'c', name: '丙', color: 'green' }] });
    const first = state.board.squares.find(s => s.type === 'station');
    state.players[0].properties = [first.stationId];
    state.players[1].cash = 50;
    state = rollDice(before(state, s => s.stationId === first.stationId, 1));
    state = answerRent(state, wrongIndex(state.pending.question));
    expect(state.players[1].cash).toBe(0);
    expect(state.players[1].bankrupt).toBe(false);
    state.players[1].bankrupt = true;
    state = ack(rollDice(before(state, s => s.type === 'start', 0)));
    expect(state.currentPlayerIndex).toBe(2);
  });
  it('pays pass-start bonus, handles self-owned stations and insufficient funds', () => {
    let state = make();
    state = rollDice(before(state, s => s.type === 'start'));
    expect(state.players[0].cash).toBe(1700);
    expect(state.phase).toBe('await_ack');
    state = ack(state);
    state = rollDice(state);
    const id = state.pending.square.stationId;
    state.players[1].cash = 100;
    state = answerBuy(state, state.pending.question.answerIndex);
    expect(state.players[1].properties).toEqual([]);
    expect(state.players[1].correct).toBe(1);
    state.players[0].properties = [id];
    state = rollDice(before(state, s => s.stationId === id));
    expect(state.phase).toBe('await_ack');
  });
  it('ignores invalid actions and validates setup', () => {
    const state = make();
    expect(answerBuy(state, 0)).toBe(state);
    expect(answerRent(state, 0)).toBe(state);
    expect(ack(state)).toBe(state);
    const waiting = rollDice(state);
    expect(rollDice(waiting)).toBe(waiting);
    expect(answerBuy(waiting, 4)).toBe(waiting);
    expect(() => make({ players: [players[0]] })).toThrow();
    expect(() => make({ players: [players[0], players[0]] })).toThrow();
    expect(() => make({ timeLimitMin: -1 })).toThrow();
  });
  it('clears a full circuit of rest penalties without hanging', () => {
    let state = make();
    state.players.forEach(p => { p.skipped = true; });
    state = { ...state, phase: 'await_ack' };
    state = ack(state);
    expect(state.phase).toBe('await_roll');
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.players.every(p => !p.skipped)).toBe(true);
  });
  it('supports six-sided rolls, no time limit and empty lore decks', () => {
    const ids = stations.filter(s => !s.taigiNote && !s.taigiHanji).slice(0, 12).map(s => s.id);
    let state = make({ selectedIds: ids, timeLimitMin: 0, now: () => 100000000, rng: () => 0.999 });
    const rolled = rollDice(state);
    expect(rolled.pending.roll).toBe(6);
    state = rollDice({ ...before(state, s => s.type === 'lore'), rng: () => 0 });
    expect(state.pending.card).toBeNull();
    expect(state.players[0].cash).toBe(1530);
    expect(ack({ ...state, startedAt: 0 }).phase).toBe('await_roll');
  });
  it('keeps rent, ack, and ranking actions immutable', () => {
    let state = make();
    const first = state.board.squares.find(s => s.type === 'station');
    state.players[0].properties = [first.stationId];
    state.players[1].cash = 10;
    state = rollDice(before(state, s => s.stationId === first.stationId, 1));
    deepFreeze(state);
    const ended = answerRent(state, wrongIndex(state.pending.question));
    expect(state.players[1].cash).toBe(10);
    expect(state.players[1].wrong).toEqual([]);
    expect(ended.phase).toBe('ended');
    const waiting = rollDice(before(make(), s => s.type === 'rest'));
    deepFreeze(waiting);
    expect(ack(waiting).currentPlayerIndex).toBe(1);
    expect(waiting.currentPlayerIndex).toBe(0);
  });
  it('does not mutate the catalog, selections, configs or previous game states', () => {
    const catalog = deepFreeze(structuredClone(stations));
    const ids = deepFreeze([...selectedIds]);
    const original = JSON.stringify(catalog);
    const state = make({ stations: catalog, selectedIds: ids, players: deepFreeze(structuredClone(players)) });
    deepFreeze(state);
    const rolled = rollDice(state);
    deepFreeze(rolled);
    const bought = answerBuy(rolled, rolled.pending.question.answerIndex);
    expect(state.players[0].cash).toBe(1500);
    expect(rolled.players[0].properties).toEqual([]);
    expect(bought.players[0].cash).toBe(1500 - STATION_PRICE);
    expect(JSON.stringify(catalog)).toBe(original);
    expect(forceEnd(state).phase).toBe('ended');
    expect(state.winnerRanking).toBeNull();
  });
});
