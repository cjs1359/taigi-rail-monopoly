# Task: Build pure rules engine for 台語地名鐵路環島大富翁

Working directory: /workspace/taigi-rail-monopoly
Station data: /workspace/taigi-rail-monopoly/data/stations.json (also public/stations.json)
DO NOT modify stations.json. DO NOT create UI. Only engine modules + vitest tests.

## Files to create

1. `src/engine/board.js` — build board from selected station ids
2. `src/engine/questions.js` — multiple-choice question generation
3. `src/engine/cards.js` — 地名典故 cards from real data only
4. `src/engine/game.js` — full game state machine
5. `src/engine/index.js` — re-exports
6. `tests/engine.test.js` — comprehensive unit tests

## Board building (`buildBoard(stations, selectedIds)`)

Input: full stations array + array of selected station ids.
Output: `{ squares: Square[], stationById: Map }`

Square types:
- `{ type:'start', id:'start', label:'起點' }` — always first
- `{ type:'station', id, stationId, label: mandarin (full text incl. aliases), line, color }`
- `{ type:'branch', id, label:'支線', branchName }` — special bonus/detour
- `{ type:'lore', id, label:'地名典故卡' }`
- `{ type:'rest', id, label:'月台休息' }` — skip turn

### Round-island trip order (counter-clockwise)

Sort selected stations into this trip, then interleave special squares.

Main ring line order (trip segments):
1. 縱貫線(北段) stations with lineOrder >= 臺北's lineOrder, ascending (臺北 south toward 竹南)
2. 海岸線 (ascending lineOrder)
3. 臺中線 (ascending)
4. 縱貫線(南段) (ascending)
5. 屏東線 (ascending)
6. 南迴線 (ascending)
7. 臺東線 (ascending)
8. 北迴線 (ascending)
9. 宜蘭線 (ascending)
10. 縱貫線(北段) stations with lineOrder < 臺北's lineOrder, ascending (基隆→接近臺北)

Find 臺北 by mandarin === '臺北' (or '台北'). If missing from catalog, treat lineOrder threshold as 14 as fallback.

### Branch lines — insert near junction region after the nearest main-line station group:
- 深澳/平溪線 → after 縱貫線(北段) northern segment (near 瑞芳 area) — insert one 支線 square labeled 平溪支線 if ANY selected station is on 深澳/平溪線; also include those stations as station squares in that region
- 內灣/六家線 → after 縱貫北段 southern / before 海岸 (near 新竹) — 內灣支線
- 集集線 → after 臺中線 / early 縱貫南 — 集集支線
- 沙崙線 → mid 縱貫南段 — 沙崙支線
- 林務局・阿里山森林鐵路 → near 嘉義 (縱貫南) — 阿里山支線
- 林務局・烏來台車, 林務局・蹦蹦車, 臺灣糖業, 預定新站及裁撤站 → append near end of their logical region or after closest main segment; include selected stations; one generic 支線 square if any selected

When a branch line has selected stations, place those station squares clustered, preceded by one `{type:'branch'}` square.

### Special squares placement
After ordering station (+ branch) squares:
- Always: start at index 0
- Insert 地名典故卡 every ~6–8 station squares (at least 2 if ≥12 stations, at least 1 if ≥6)
- Insert 月台休息 about halfway around the board (1 if ≥10 stations, 2 if ≥24)
- Target total squares roughly selectedCount + specials, adapting to 16–32 recommended selection

### Line colors (hex)
```
縱貫線(北段): #5B8C5A
海岸線: #4A90A4
臺中線: #C4A35A
縱貫線(南段): #6B8E23
屏東線: #D4A017
南迴線: #C75B39
臺東線: #8B6B4A
北迴線: #3D7A6A
宜蘭線: #5A7A9A
深澳/平溪線: #9B6B9B
內灣/六家線: #7A9B6B
集集線: #B8860B
沙崙線: #708090
林務局・阿里山森林鐵路: #2E8B57
default: #7A8B6B
```

## Questions (`questions.js`)

`generateBuyQuestion(station, allStations, rng)` →
```
{ kind:'buy-tl', stationId, prompt: `「${mandarin}」的台羅怎麼唸？`,
  options: string[4],  // Tâi-lô strings, shuffled
  answerIndex: 0..3,
  reveal: { mandarin, taigiHanji, taigiTl, taigiAlt, taigiNote } }
```
Distractors: other stations' taigiTl, prefer ones sharing a syllable/prefix or same line; never duplicate correct; if not enough, take any unique tl.

`generateRentQuestion(station, allStations, rng)` →
- If station.differs && station.taigiHanji: ask `「${mandarin}」的建議漢字／舊名是？` with 4 hanji options (distractors from other differs stations with hanji)
- Else: same as buy Tâi-lô question
- kind: 'rent-hanji' | 'rent-tl'

Use injected `rng()` returning [0,1) for shuffle so tests are deterministic. Default Math.random.

`checkAnswer(question, chosenIndex)` → boolean

## Lore cards (`cards.js`)

`buildLoreDeck(stations, selectedIds)` → array of cards:
Only from stations that have taigiNote OR taigiHanji (non-null).
```
{ id, stationId, title: mandarin,
  body: string built ONLY from existing fields —
    e.g. if taigiHanji: `「${mandarin}」台語建議漢字寫作「${taigiHanji}」。`
    if taigiNote: append the note text as-is
    if taigiAlt: `又音：${taigiAlt}`
  NEVER invent historical facts not in the data. }
```
Shuffle with rng. `drawLoreCard(deck, index)` cycles.

Landing on lore: draw card, optional small coin bonus (+50) or nothing — keep simple: +30 旅費 for reading.

## Game engine (`game.js`)

### Constants
- START_CASH = 1500
- STATION_PRICE = 200 (flat v1; or 150 + 10*lineOrder%20 — keep flat 200)
- BASE_RENT = 50
- PASS_START_BONUS = 200
- BRANCH_BONUS = 100
- LORE_BONUS = 30
- BUY_WRONG: cannot buy this turn
- RENT_CORRECT: pay ceil(rent/2)

### createGame(config)
```
config = {
  stations,          // full catalog
  selectedIds,       // string[]
  players: [{ id, name, color }],  // 2–4
  timeLimitMin: 25,  // 0 = no limit
  readAloud: false,
  rng: () => Math.random(),
  now: () => Date.now(),
}
```
Returns game state:
```
{
  board, players: [{ id, name, color, cash, position, properties: string[], skipped: bool, correct: number, wrong: {stationId, kind, chosen, correctAnswer, reveal}[] , bankrupt: bool }],
  currentPlayerIndex,
  phase: 'await_roll' | 'await_buy_answer' | 'await_rent_answer' | 'await_lore' | 'await_ack' | 'ended',
  pending: null | { type, question?, square?, card?, rentDue?, ... },
  turnNumber, startedAt, timeLimitMin, readAloud,
  loreDeck, loreIndex,
  log: string[],  // Traditional Chinese short messages
  winnerRanking: null | [...]
}
```

### Actions (pure: take state + action → new state; do not mutate)

`rollDice(state)` — only in await_roll; 1d6; move; handle pass start; resolve landing:
- start: just await_roll next? or ack — go to next phase for landing
- station unowned: pending buy question → await_buy_answer
- station owned by self: await_ack (nothing)
- station owned by other: pending rent question → await_rent_answer  
- branch: +BRANCH_BONUS, await_ack
- lore: draw card +LORE_BONUS, await_lore
- rest: set skipped for next turn of this player, await_ack

`answerBuy(state, optionIndex)` — if correct and cash>=price, buy; always record wrong if incorrect; then nextTurn
`answerRent(state, optionIndex)` — compute rent (half if correct); pay; bankruptcy check; record wrong; nextTurn
`ack(state)` — dismiss lore/ack → nextTurn
`nextTurn` internal: skip bankrupt; if player.skipped, clear skip and skip their turn; check time/end

`forceEnd(state)` — end game, compute ranking

### Ranking
Sort by (cash + properties.length * STATION_PRICE) desc, then correct desc.
Include wrongAnswers list per player.

### Bankruptcy
If cash < 0 after rent: sell is auto — for v1 mark bankrupt, transfer their properties to creditor (the landlord), cash to 0. If cannot pay even that, still bankrupt.

### End conditions
- Any time `now() - startedAt >= timeLimitMin * 60000` after a turn resolves (if timeLimitMin > 0)
- Only 1 non-bankrupt player left
- forceEnd

## Tests (vitest)

Cover:
- buildBoard orders Taipei-south before Kaohsiung before Taitung before Yilan before Keelung-side
- branch square inserted when 平溪 stations selected
- generateBuyQuestion has 4 unique options including correct tl
- generateRentQuestion uses hanji when differs+hanji
- full mini game: 2 players, roll, buy correct, buy wrong cannot buy, rent half on correct, rest skips, lore draws, time end ranking, wrong list populated
- bankruptcy transfers property
- no mutation of input stations array

Export everything needed by UI from index.js.

Use ES modules. No TypeScript. Comments in English or Traditional Chinese OK.
