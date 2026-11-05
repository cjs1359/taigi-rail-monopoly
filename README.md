# 台語地名鐵路環島大富翁

線上熱座（hot-seat）大富翁：2–4 人共用一台平板／電腦，搭配台語地名教學。盤面依選站組成環島鐵路一圈，買站、付租金都要先答台羅或建議漢字。

**線上版：** https://cjs1359.github.io/taigi-rail-monopoly/

## 功能（v1.3.3）

- 老師選站：依路線勾選／整線一鍵、自動挑台華語不同站、隨機 N 站、localStorage 儲存組合
- 方型大富翁棋盤（≤40 格）：依 canonical 環島順序（臺北→西下→南→東→宜蘭回基隆）；邊標依實際站點推算；選站超過上限可一鍵縮減
- 學習規則：買站四選一台羅；踩到別人的站答題可租金減半；答完揭示華語／漢字／台羅／又音／註記
- 「大家一起唸」：答題前先放大站名
- 限時結算（預設 25 分）＋答錯複習清單（列印／複製）
- 四隊可愛西洋棋棋子（紅＝國王、青＝騎士、藍＝城堡、金＝皇后）：自訂 chibi SVG，棋盤／側欄／回合列／色條擁有標記／結算皆可見；棋子走在盤格**外側軌道**（不遮站名／台羅）；同格最多 4 枚並列；移動逐格跳躍（尊重 prefers-reduced-motion）
- 棋盤格放大：盤面依視窗撐滿（方型），站名／台羅以兩行內完整顯示、不裁切；擁有標記仍在色條內，棋子走外側
- 課堂友善音效：Web Audio API 瀏覽器即時合成（無外部音檔授權疑慮）；靜音鈕＋音量滑桿存 localStorage；首次點擊後才播放（瀏覽器自動播放規則）

資料來源：教育部《以本土語言標注臺灣地名計畫》鐵路篇整理之 `data/stations.json`（286 站）。

## 技術

- Vite 8 + vanilla JS（無後端）
- 純規則引擎：`src/engine/`（vitest 單元測試）
- GitHub Pages：`base = /taigi-rail-monopoly/`

## 協作紀錄

| 工具 | 負責 |
|------|------|
| ChatGPT Codex (`codex exec --sandbox workspace-write`) | `src/engine/*` 規則引擎與 `tests/engine.test.js` |
| Claude Code CLI | 程式碼審查（見下方） |
| Grok Bot | UI、部署、Playwright 驗證、整合 |

## 開發

```bash
npm install
npm test
npm run dev
npm run build
```

## 音訊

- 所有音效由 `src/ui/audio.js` 以 Web Audio API 合成（骰子、步伐、到站、答對／錯、買賣、過起點、典故卡、支線、休息、換手、結束），無需外部音檔。
- 若日後加入音檔，僅使用自製或 CC0，並於本節註明來源。
- `playPronunciation(stationId)` 預留給未來台語發音（TTS／錄音），目前為 no-op。

## Claude 審查摘要（v1）

- 已修：支線落地日誌改用 `branchName`；棋盤文字字級依實際顯示字串；對話框加 `role=dialog`／焦點；台羅加 `lang="nan-Latn-TW"`。
- 已知：Noto Sans 對部分台羅調號（如結合字符 U+030D）的標位需實機再確認；44 站盤面偏擠，建議課堂選 16–32 站。
