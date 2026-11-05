import { shuffle } from './questions.js';
export function buildLoreDeck(stations, selectedIds, rng = Math.random) {
  const ids = new Set(selectedIds);
  return shuffle(stations.filter(s => ids.has(s.id) && (s.taigiNote || s.taigiHanji)).map(s => ({
    id: `lore:${s.id}`, stationId: s.id, title: s.mandarin,
    body: [s.taigiHanji && `「${s.mandarin}」台語建議漢字寫作「${s.taigiHanji}」。`,
      s.taigiNote, s.taigiAlt && `又音：${s.taigiAlt}`].filter(Boolean).join('\n'),
  })), rng);
}
export function drawLoreCard(deck, index) {
  return deck.length ? deck[((index % deck.length) + deck.length) % deck.length] : null;
}
