const KEY = 'taigi-rail-monopoly.stationSets.v1';

export function loadSets() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSets(sets) {
  localStorage.setItem(KEY, JSON.stringify(sets));
}

export function upsertSet(name, selectedIds) {
  const sets = loadSets().filter(s => s.name !== name);
  sets.unshift({ name, selectedIds: [...selectedIds], savedAt: Date.now() });
  saveSets(sets.slice(0, 30));
  return sets;
}

export function deleteSet(name) {
  const sets = loadSets().filter(s => s.name !== name);
  saveSets(sets);
  return sets;
}
