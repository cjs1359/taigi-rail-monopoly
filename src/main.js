import './style.css';
import { createGame } from './engine/game.js';
import { renderSetup } from './ui/setup.js';
import { renderPlay } from './ui/play.js';
import { renderEnd } from './ui/end.js';
import { installAudioUnlock } from './ui/audio.js';

const app = document.getElementById('app');
let stations = [];
let lastConfig = null;
let stopPlay = null;

async function boot() {
  installAudioUnlock();
  const url = `${import.meta.env.BASE_URL}stations.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法載入車站資料（${res.status}）`);
  stations = await res.json();
  showSetup();
}

function showSetup() {
  stopPlay?.();
  stopPlay = null;
  renderSetup(app, {
    stations,
    onStart: (config) => {
      lastConfig = config;
      startGame(config);
    },
  });
}

function startGame(config) {
  stopPlay?.();
  const game = createGame({
    stations,
    selectedIds: config.selectedIds,
    players: config.players,
    timeLimitMin: config.timeLimitMin,
    readAloud: config.readAloud,
  });
  stopPlay = renderPlay(app, {
    game,
    stations,
    onEnd: (finalState) => {
      stopPlay?.();
      stopPlay = null;
      renderEnd(app, {
        game: finalState,
        stations,
        onReplay: () => startGame(lastConfig),
        onSetup: showSetup,
      });
    },
    onExit: showSetup,
  });
}

boot().catch(err => {
  app.innerHTML = `<div class="screen"><div class="card"><h1>載入失敗</h1><p>${String(err.message || err)}</p></div></div>`;
  console.error(err);
});
