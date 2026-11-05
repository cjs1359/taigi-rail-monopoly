export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function question(station, allStations, rng, hanji, kind) {
  const field = hanji ? 'taigiHanji' : 'taigiTl';
  const correct = station[field];
  if (!correct) throw new Error(`車站缺少答案：${station.id}`);
  const syllables = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[-\s]+/);
  const own = syllables(station.taigiTl ?? '');
  const candidates = allStations.filter(s => s.id !== station.id && s[field] && (!hanji || s.differs));
  const preferred = s => s.line === station.line || syllables(s.taigiTl ?? '').some(x => own.includes(x));
  const values = [...new Set([...shuffle(candidates.filter(preferred), rng),
    ...shuffle(candidates.filter(s => !preferred(s)), rng)].map(s => s[field]))].filter(x => x !== correct);
  if (values.length < 3) throw new Error('題庫不足四個不同答案');
  const options = shuffle([correct, ...values.slice(0, 3)], rng);
  const { mandarin, taigiHanji, taigiTl, taigiAlt, taigiNote } = station;
  return { kind, stationId: station.id,
    prompt: hanji ? `「${mandarin}」的建議漢字／舊名是？` : `「${mandarin}」的台羅怎麼唸？`,
    options, answerIndex: options.indexOf(correct),
    reveal: { mandarin, taigiHanji, taigiTl, taigiAlt, taigiNote } };
}
export function generateBuyQuestion(station, allStations, rng = Math.random) {
  return question(station, allStations, rng, false, 'buy-tl');
}
export function generateRentQuestion(station, allStations, rng = Math.random) {
  const hanji = Boolean(station.differs && station.taigiHanji);
  return question(station, allStations, rng, hanji, hanji ? 'rent-hanji' : 'rent-tl');
}
export function checkAnswer(question, chosenIndex) {
  return Number.isInteger(chosenIndex) && chosenIndex >= 0 && chosenIndex < question.options.length && chosenIndex === question.answerIndex;
}
