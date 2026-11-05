import { buildBoard } from './board.js';
import { generateBuyQuestion, generateRentQuestion, checkAnswer } from './questions.js';
import { buildLoreDeck, drawLoreCard } from './cards.js';

export const START_CASH = 1500;
export const STATION_PRICE = 200;
export const BASE_RENT = 50;
export const PASS_START_BONUS = 200;
export const BRANCH_BONUS = 100;
export const LORE_BONUS = 30;

export function createGame({ stations, selectedIds, players, timeLimitMin = 25,
  readAloud = false, rng = Math.random, now = Date.now }) {
  if (players.length < 2 || players.length > 4 || new Set(players.map(p => p.id)).size !== players.length) {
    throw new Error('需要 2–4 位具有不同 id 的玩家');
  }
  if (!Number.isFinite(timeLimitMin) || timeLimitMin < 0) throw new Error('時間限制必須為非負數');
  return {
    board: buildBoard(stations, selectedIds),
    players: players.map(({ id, name, color, piece }, i) => ({
      id, name, color, piece: piece || ['king', 'knight', 'rook', 'queen'][i] || 'king',
      cash: START_CASH, position: 0, properties: [], skipped: false, correct: 0, wrong: [], bankrupt: false,
    })),
    currentPlayerIndex: 0, phase: 'await_roll', pending: null, turnNumber: 1,
    startedAt: now(), timeLimitMin, readAloud, rng, now,
    loreDeck: buildLoreDeck(stations, selectedIds, rng), loreIndex: 0,
    log: ['環島旅程開始！'], winnerRanking: null,
  };
}

// Copy only mutable game state; board and catalog are shared read-only by actions.
function copy(state) {
  return { ...state, players: state.players.map(p => ({ ...p, properties: [...p.properties],
    wrong: [...p.wrong] })), log: [...state.log] };
}
function end(state) {
  state.phase = 'ended';
  state.pending = null;
  state.winnerRanking = state.players.map(p => ({ id: p.id, name: p.name, color: p.color, piece: p.piece,
    cash: p.cash, properties: [...p.properties], correct: p.correct, bankrupt: p.bankrupt,
    totalAssets: p.cash + p.properties.length * STATION_PRICE,
    wrongAnswers: p.wrong.map(w => ({ ...w, reveal: { ...w.reveal } })) }))
    .sort((a, b) => b.totalAssets - a.totalAssets || b.correct - a.correct);
  state.log.push('旅程結束，結算資產。');
  return state;
}
function nextTurn(state) {
  state.pending = null;
  if (state.players.filter(p => !p.bankrupt).length <= 1 ||
    (state.timeLimitMin > 0 && state.now() - state.startedAt >= state.timeLimitMin * 60000)) return end(state);
  // At most one extra circuit is needed to clear every remaining rest penalty.
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.turnNumber++;
    const p = state.players[state.currentPlayerIndex];
    if (p.bankrupt) continue;
    if (p.skipped) {
      p.skipped = false;
      state.log.push(`${p.name}在月台休息，暫停一回合。`);
      continue;
    }
    break;
  } while (true);
  state.phase = 'await_roll';
  return state;
}
function record(player, question, index) {
  if (checkAnswer(question, index)) { player.correct++; return true; }
  player.wrong.push({ stationId: question.stationId, kind: question.kind,
    chosen: question.options[index], correctAnswer: question.options[question.answerIndex],
    reveal: { ...question.reveal } });
  return false;
}
function validOption(state, index) {
  return Number.isInteger(index) && index >= 0 && index < state.pending.question.options.length;
}
export function rollDice(state) {
  if (state.phase !== 'await_roll') return state;
  const result = copy(state), player = result.players[result.currentPlayerIndex];
  const roll = Math.floor(result.rng() * 6) + 1;
  const distance = player.position + roll, size = result.board.squares.length;
  const laps = Math.floor(distance / size);
  player.position = distance % size;
  player.cash += laps * PASS_START_BONUS;
  if (laps) result.log.push(`${player.name}經過起點，領取 ${laps * PASS_START_BONUS} 旅費。`);
  const square = result.board.squares[player.position];
  const landLabel = square.type === 'branch' && square.branchName ? square.branchName : square.label;
  result.log.push(`${player.name}擲出 ${roll} 點，抵達${landLabel}。`);
  result.pending = { type: square.type, square, roll };
  result.phase = 'await_ack';
  if (square.type === 'station') {
    const owner = result.players.find(p => p.properties.includes(square.stationId));
    const station = result.board.stationById.get(square.stationId);
    const catalog = [...result.board.stationById.values()];
    if (!owner) {
      result.phase = 'await_buy_answer';
      result.pending = { ...result.pending, type: 'buy', price: STATION_PRICE,
        question: generateBuyQuestion(station, catalog, result.rng) };
    } else if (owner.id !== player.id) {
      result.phase = 'await_rent_answer';
      result.pending = { ...result.pending, type: 'rent', ownerId: owner.id, rentDue: BASE_RENT,
        question: generateRentQuestion(station, catalog, result.rng) };
    }
  } else if (square.type === 'branch') {
    player.cash += BRANCH_BONUS;
    result.log.push(`${player.name}獲得支線旅費 ${BRANCH_BONUS}。`);
  } else if (square.type === 'lore') {
    const card = drawLoreCard(result.loreDeck, result.loreIndex);
    result.loreIndex++;
    player.cash += LORE_BONUS;
    result.pending = { ...result.pending, card };
    result.phase = 'await_lore';
    result.log.push(`${player.name}閱讀地名典故，獲得 ${LORE_BONUS} 旅費。`);
  } else if (square.type === 'rest') player.skipped = true;
  return result;
}
export function answerBuy(state, optionIndex) {
  if (state.phase !== 'await_buy_answer' || !validOption(state, optionIndex)) return state;
  const result = copy(state), p = result.players[result.currentPlayerIndex];
  const correct = record(p, result.pending.question, optionIndex);
  if (correct && p.cash >= STATION_PRICE) {
    p.cash -= STATION_PRICE;
    p.properties.push(result.pending.square.stationId);
    result.log.push(`${p.name}答對並購入${result.pending.square.label}。`);
  } else result.log.push(correct ? `${p.name}旅費不足，無法購買。` : `${p.name}答錯，本回合無法購買。`);
  return nextTurn(result);
}
export function answerRent(state, optionIndex) {
  if (state.phase !== 'await_rent_answer' || !validOption(state, optionIndex)) return state;
  const result = copy(state), p = result.players[result.currentPlayerIndex];
  const owner = result.players.find(p => p.id === result.pending.ownerId);
  const correct = record(p, result.pending.question, optionIndex);
  const due = correct ? Math.ceil(result.pending.rentDue / 2) : result.pending.rentDue;
  const available = p.cash;
  p.cash -= due;
  owner.cash += Math.min(available, due);
  result.log.push(`${p.name}${correct ? '答對，租金減半' : '答錯'}，應付租金 ${due}。`);
  if (p.cash < 0) {
    p.bankrupt = true;
    p.cash = 0;
    owner.properties.push(...p.properties);
    p.properties = [];
    result.log.push(`${p.name}破產，車站轉交${owner.name}。`);
  }
  return nextTurn(result);
}
export function ack(state) {
  if (!['await_ack', 'await_lore'].includes(state.phase)) return state;
  return nextTurn(copy(state));
}
export function forceEnd(state) {
  return state.phase === 'ended' ? state : end(copy(state));
}
