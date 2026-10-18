/* global io */
const socket = io();

const STORAGE_KEY = 'dice_forge_companion_session_v1';

const state = {
  catalog: {
    sanctuaryPools: [],
    gardenFaces: [],
    playerColors: []
  },
  room: null,
  myPlayerId: null,
  focusedPlayerId: null,
  viewMode: 'focused', // 'focused' | 'table'
  setupPlayerCountChoice: 4,
  forgeModal: {
    isOpen: false,
    playerId: null,
    dieType: 'light', // 'light' | 'dark'
    slotIndex: 0,
    activeTab: 'sanctuary'
  }
};

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyError = document.getElementById('lobby-error');
const rejoinBanner = document.getElementById('rejoin-banner');
const rejoinCodeEl = document.getElementById('rejoin-code');

const displayRoomCode = document.getElementById('display-room-code');
const displayRound = document.getElementById('display-round');
const displayActiveHero = document.getElementById('display-active-hero');
const blessingCountBadge = document.getElementById('blessing-count-badge');
const sanctuaryStockBadge = document.getElementById('sanctuary-stock-badge');
const btnUndo = document.getElementById('btn-undo');

const tabMyHero = document.getElementById('tab-my-hero');
const tabTableView = document.getElementById('tab-table-view');
const heroSwitcherPills = document.getElementById('hero-switcher-pills');
const scoreboardStrip = document.getElementById('scoreboard-strip');
const heroesContainer = document.getElementById('heroes-container');
const activityLog = document.getElementById('activity-log');

// Forge Modal DOM
const forgeModal = document.getElementById('forge-modal');
const forgePlayerSelect = document.getElementById('forge-player-select');
const forgePlayerGold = document.getElementById('forge-player-gold');
const forgeAutoPay = document.getElementById('forge-auto-pay');
const forgeShipDiscount = document.getElementById('forge-ship-discount');
const forgeOverrideRule = document.getElementById('forge-override-rule');
const forgeLightSlots = document.getElementById('forge-light-slots');
const forgeDarkSlots = document.getElementById('forge-dark-slots');
const sanctuaryPoolsGrid = document.getElementById('sanctuary-pools-grid');
const gardensFacesGrid = document.getElementById('gardens-faces-grid');
const forgeError = document.getElementById('forge-error');

// Setup Modal DOM
const setupModal = document.getElementById('setup-modal');

// Fetch catalog on startup
fetch('/api/catalog')
  .then((r) => r.json())
  .then((data) => {
    state.catalog = data;
    renderGardensCatalog();
  })
  .catch((err) => console.error('Failed to load catalog:', err));

// Check URL query `?room=XXXX` and localStorage session
function initSessionCheck() {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');
  if (urlRoom) {
    document.getElementById('join-code').value = urlRoom.toUpperCase().slice(0, 4);
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.roomCode) {
      rejoinCodeEl.textContent = saved.roomCode;
      rejoinBanner.classList.remove('hidden');
      document.getElementById('btn-rejoin').onclick = () => {
        joinRoomRequest(saved.roomCode, saved.playerName || '', saved.playerId, saved.isTableView);
      };
    }
  } catch (_) {
    // ignore storage errors
  }
}
initSessionCheck();

function saveSession(roomCode, playerId, playerName, isTableView = false) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ roomCode, playerId, playerName, isTableView })
    );
  } catch (_) {}
}

function showLobbyError(msg) {
  if (!msg) {
    lobbyError.classList.add('hidden');
    return;
  }
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
}

// Setup player count segmented control in Lobby
document.querySelectorAll('#setup-count-picker .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#setup-count-picker .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.setupPlayerCountChoice = Number(btn.dataset.count) || 4;
  });
});

// Create Room handlers
document.getElementById('btn-create-room').addEventListener('click', () => {
  const name = document.getElementById('create-name').value.trim() || 'Hero 1';
  createRoomRequest(name, state.setupPlayerCountChoice, false);
});

document.getElementById('btn-create-table').addEventListener('click', () => {
  createRoomRequest('', state.setupPlayerCountChoice, true);
});

function createRoomRequest(playerName, playerCount, asTableView) {
  showLobbyError('');
  socket.emit('create_room', { playerName, playerCount, asTableView }, (res) => {
    if (!res || !res.ok) {
      showLobbyError(res?.error || 'Could not create room.');
      return;
    }
    state.myPlayerId = res.playerId;
    state.focusedPlayerId = res.playerId;
    state.viewMode = asTableView ? 'table' : 'focused';
    saveSession(res.roomCode, res.playerId, playerName, asTableView);
    enterGameScreen(res.roomCode);
  });
}

// Join Room handlers
document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim() || 'Hero';
  if (code.length !== 4) {
    showLobbyError('Please enter a 4-letter Room Code.');
    return;
  }
  joinRoomRequest(code, name, null, false);
});

document.getElementById('btn-join-table').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length !== 4) {
    showLobbyError('Please enter a 4-letter Room Code.');
    return;
  }
  joinRoomRequest(code, '', null, true);
});

function joinRoomRequest(roomCode, playerName, existingPlayerId, asTableView) {
  showLobbyError('');
  socket.emit(
    'join_room',
    { roomCode, playerName, existingPlayerId, asTableView },
    (res) => {
      if (!res || !res.ok) {
        showLobbyError(res?.error || 'Could not join room.');
        return;
      }
      state.myPlayerId = res.playerId;
      state.focusedPlayerId = res.playerId;
      state.viewMode = asTableView ? 'table' : 'focused';
      saveSession(res.roomCode, res.playerId, playerName, asTableView);
      enterGameScreen(res.roomCode);
    }
  );
}

function enterGameScreen(roomCode) {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  window.history.replaceState({}, '', url.toString());
  updateViewModeTabs();
}

// Receive live room state
socket.on('room_state', (roomData) => {
  state.room = roomData;
  if (!state.focusedPlayerId && roomData.players.length > 0) {
    state.focusedPlayerId = state.myPlayerId || roomData.players[0].id;
  } else if (
    state.focusedPlayerId &&
    !roomData.players.some((p) => p.id === state.focusedPlayerId) &&
    roomData.players.length > 0
  ) {
    state.focusedPlayerId = roomData.players[0].id;
  }
  renderAll();
});

// Auto-rejoin on socket reconnect (e.g. phone screen wakes up)
socket.on('connect', () => {
  if (state.room && state.room.code) {
    socket.emit('join_room', {
      roomCode: state.room.code,
      existingPlayerId: state.myPlayerId,
      asTableView: state.viewMode === 'table' && !state.myPlayerId
    });
  }
});

// Periodic HTTP keep-alive every 4 minutes so free-tier hosts (like Render) never sleep mid-game
setInterval(() => {
  if (state.room && state.room.code) {
    fetch('/health').catch(() => {});
  }
}, 4 * 60 * 1000);

// Topbar & View Switcher controls
document.getElementById('btn-copy-room').addEventListener('click', () => {
  if (!state.room) return;
  const inviteUrl = `${window.location.origin}/?room=${state.room.code}`;
  navigator.clipboard?.writeText(inviteUrl);
  const hint = document.querySelector('#btn-copy-room .copy-hint');
  hint.textContent = '✅ Copied!';
  setTimeout(() => {
    hint.textContent = '🔗';
  }, 1800);
});

document.getElementById('btn-divine-blessing').addEventListener('click', () => {
  if (!state.room) return;
  socket.emit('roll_all_divine_blessing', { roomCode: state.room.code });
});

document.getElementById('btn-next-turn').addEventListener('click', () => {
  if (!state.room) return;
  socket.emit('next_turn', { roomCode: state.room.code });
});

document.getElementById('btn-undo').addEventListener('click', () => {
  if (!state.room) return;
  socket.emit('undo_last', { roomCode: state.room.code });
});

document.getElementById('btn-leave-room').addEventListener('click', () => {
  gameScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  initSessionCheck();
});

tabMyHero.addEventListener('click', () => {
  state.viewMode = 'focused';
  updateViewModeTabs();
  renderAll();
});

tabTableView.addEventListener('click', () => {
  state.viewMode = 'table';
  updateViewModeTabs();
  renderAll();
});

function updateViewModeTabs() {
  tabMyHero.classList.toggle('active', state.viewMode === 'focused');
  tabTableView.classList.toggle('active', state.viewMode === 'table');
}

document.getElementById('btn-add-seat').addEventListener('click', () => {
  if (!state.room) return;
  const nextNum = state.room.players.length + 1;
  const name = prompt(`Enter name for Hero ${nextNum}:`, `Hero ${nextNum}`);
  if (name === null) return;
  socket.emit('add_player_seat', { roomCode: state.room.code, playerName: name.trim() || `Hero ${nextNum}` }, (res) => {
    if (res && res.ok && res.playerId) {
      state.focusedPlayerId = res.playerId;
      renderAll();
    } else if (res && res.error) {
      alert(res.error);
    }
  });
});

// Setup / Reset Modal
document.getElementById('btn-setup-config').addEventListener('click', () => {
  setupModal.classList.remove('hidden');
});
document.getElementById('btn-close-setup').addEventListener('click', () => {
  setupModal.classList.add('hidden');
});
document.querySelectorAll('.btn-setup-count').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state.room) return;
    const count = Number(btn.dataset.count);
    socket.emit('set_player_count_setup', { roomCode: state.room.code, playerCount: count });
    setupModal.classList.add('hidden');
  });
});
document.getElementById('btn-reset-game').addEventListener('click', () => {
  if (!state.room) return;
  if (confirm('Reset all dice, resources, and Sanctuary stock back to Round 1?')) {
    socket.emit('reset_game', { roomCode: state.room.code });
    setupModal.classList.add('hidden');
  }
});

// Forge / Sanctuary Modal Controls
document.getElementById('btn-open-sanctuary').addEventListener('click', () => {
  openForgeModal(state.focusedPlayerId || state.myPlayerId, 'light', 0);
});
document.getElementById('btn-close-forge').addEventListener('click', () => {
  closeForgeModal();
});
forgePlayerSelect.addEventListener('change', () => {
  state.forgeModal.playerId = forgePlayerSelect.value;
  renderForgeModalContent();
});
forgeOverrideRule.addEventListener('change', () => {
  renderForgeModalContent();
});
forgeShipDiscount.addEventListener('change', () => {
  renderForgeModalContent();
});

document.querySelectorAll('.modal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.forgeModal.activeTab = tab.dataset.tab;
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.getElementById('forge-tab-sanctuary').classList.toggle('active', state.forgeModal.activeTab === 'sanctuary');
    document.getElementById('forge-tab-gardens').classList.toggle('active', state.forgeModal.activeTab === 'gardens');
    document.getElementById('forge-tab-custom').classList.toggle('active', state.forgeModal.activeTab === 'custom');
  });
});

document.getElementById('btn-forge-custom').addEventListener('click', () => {
  if (!state.room || !state.forgeModal.playerId) return;
  const customFace = {
    name: document.getElementById('custom-face-name').value.trim(),
    gold: Number(document.getElementById('custom-face-gold').value) || 0,
    sun: Number(document.getElementById('custom-face-sun').value) || 0,
    moon: Number(document.getElementById('custom-face-moon').value) || 0,
    glory: Number(document.getElementById('custom-face-glory').value) || 0
  };
  if (!customFace.name) {
    const parts = [];
    if (customFace.gold) parts.push(`${customFace.gold} Gold`);
    if (customFace.sun) parts.push(`${customFace.sun} Sun`);
    if (customFace.moon) parts.push(`${customFace.moon} Moon`);
    if (customFace.glory) parts.push(`${customFace.glory} Glory`);
    customFace.name = parts.join(' + ') || 'Blank Face';
  }
  triggerForgeFace('custom', null, customFace);
});

function openForgeModal(playerId, dieType = 'light', slotIndex = 0) {
  if (!state.room || state.room.players.length === 0) return;
  state.forgeModal.isOpen = true;
  state.forgeModal.playerId = playerId || state.room.players[0].id;
  state.forgeModal.dieType = dieType;
  state.forgeModal.slotIndex = slotIndex;
  forgeError.classList.add('hidden');
  forgeModal.classList.remove('hidden');
  renderForgeModalContent();
}

function closeForgeModal() {
  state.forgeModal.isOpen = false;
  forgeModal.classList.add('hidden');
}

function triggerForgeFace(sourceType, faceId, customFace = null) {
  if (!state.room || !state.forgeModal.playerId) return;
  forgeError.classList.add('hidden');

  socket.emit(
    'forge_die_face',
    {
      roomCode: state.room.code,
      playerId: state.forgeModal.playerId,
      dieType: state.forgeModal.dieType,
      slotIndex: state.forgeModal.slotIndex,
      sourceType,
      faceId,
      customFace,
      autoPayGold: forgeAutoPay.checked,
      discountGold: forgeShipDiscount.checked ? 2 : 0,
      forceBoarOverride: forgeOverrideRule.checked
    },
    (res) => {
      if (res && !res.ok) {
        forgeError.textContent = res.error || 'Could not forge face.';
        forgeError.classList.remove('hidden');
      } else {
        // Advance selected slot to the next starting face automatically for multi-forging convenience
        const player = state.room.players.find((p) => p.id === state.forgeModal.playerId);
        if (player) {
          const currentDie = state.forgeModal.dieType === 'dark' ? player.darkDie : player.lightDie;
          const nextStartingIdx = currentDie.findIndex((f, i) => i !== state.forgeModal.slotIndex && f.isStarting);
          if (nextStartingIdx !== -1) {
            state.forgeModal.slotIndex = nextStartingIdx;
          }
        }
        renderForgeModalContent();
      }
    }
  );
}

// Rendering Functions
function getPlayerCaps(player) {
  const chests = Number(player.resources.chests) || 0;
  return {
    gold: 12 + chests * 4,
    sun: 6 + chests * 3,
    moon: 6 + chests * 3
  };
}

function renderAll() {
  const room = state.room;
  if (!room) return;

  displayRoomCode.textContent = room.code;
  displayRound.textContent =
    room.round > room.maxRounds ? `Final Scores (${room.maxRounds}/${room.maxRounds})` : `${room.round} / ${room.maxRounds}`;

  const activePlayer = room.players[room.activePlayerIndex];
  displayActiveHero.textContent = activePlayer ? `Active: ${activePlayer.name}` : 'Waiting for Heroes';

  blessingCountBadge.textContent = `${room.divineBlessingsRemainingInTurn}x`;
  const totalStock = (room.sanctuary || []).reduce((acc, s) => acc + (s.remaining || 0), 0);
  sanctuaryStockBadge.textContent = `${totalStock}`;

  btnUndo.disabled = !room.canUndo;
  btnUndo.title = room.lastUndoLabel ? `Undo: ${room.lastUndoLabel}` : 'Nothing to undo';

  document.getElementById('btn-add-seat').classList.toggle('hidden', room.players.length >= 4);

  renderHeroSwitcherPills(room);
  renderScoreboardStrip(room);
  renderHeroesMain(room);
  renderActivityLog(room);

  if (state.forgeModal.isOpen) {
    renderForgeModalContent();
  }
}

function renderHeroSwitcherPills(room) {
  heroSwitcherPills.innerHTML = '';
  room.players.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = `hero-pill ${p.id === state.focusedPlayerId ? 'active' : ''}`;
    btn.innerHTML = `<span class="color-dot" style="background:${p.color.hex}"></span>${escapeHtml(p.name)}${
      p.id === state.myPlayerId ? ' (You)' : ''
    }`;
    btn.onclick = () => {
      state.focusedPlayerId = p.id;
      if (state.viewMode === 'table') {
        state.viewMode = 'focused';
        updateViewModeTabs();
      }
      renderAll();
    };
    heroSwitcherPills.appendChild(btn);
  });
}

function renderScoreboardStrip(room) {
  scoreboardStrip.innerHTML = '';
  room.players.forEach((p, idx) => {
    const totalGlory = (p.resources.glory || 0) + (p.resources.cardGlory || 0);
    const pendingCount = (p.lastRoll?.pendingChoices || []).length;
    const card = document.createElement('div');
    card.className = `score-mini-card ${p.id === state.focusedPlayerId && state.viewMode === 'focused' ? 'focused' : ''} ${
      idx === room.activePlayerIndex ? 'active-turn' : ''
    }`;
    card.innerHTML = `
      <div class="score-mini-top">
        <div class="score-mini-name">
          <span class="color-dot" style="background:${p.color.hex}"></span>
          ${escapeHtml(p.name)}
          ${idx === room.activePlayerIndex ? '<span title="Active Turn">⚡</span>' : ''}
        </div>
        <div class="score-mini-total">🟢 ${totalGlory} VP</div>
      </div>
      <div class="score-mini-resources">
        <span>🟡 ${p.resources.gold}</span>
        <span>🟠 ${p.resources.sun}</span>
        <span>🟣 ${p.resources.moon}</span>
        ${pendingCount > 0 ? `<span style="color:var(--gold);font-weight:700">⚠️ ${pendingCount} Choice</span>` : ''}
      </div>
      <div class="score-mini-roll">🎲 ${escapeHtml(p.lastRoll?.summary || 'Ready')}</div>
    `;
    card.onclick = () => {
      state.focusedPlayerId = p.id;
      renderAll();
    };
    scoreboardStrip.appendChild(card);
  });
}

function renderHeroesMain(room) {
  heroesContainer.innerHTML = '';
  heroesContainer.classList.toggle('table-grid', state.viewMode === 'table');

  if (room.players.length === 0) {
    heroesContainer.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;">
        <h3>No Heroes Seated Yet</h3>
        <p class="card-desc">Click "+ Add Hero" above or join with code <strong>${room.code}</strong> from a phone.</p>
      </div>
    `;
    return;
  }

  const playersToShow =
    state.viewMode === 'table'
      ? room.players
      : room.players.filter((p) => p.id === state.focusedPlayerId);

  playersToShow.forEach((player) => {
    const isTurn = room.players[room.activePlayerIndex]?.id === player.id;
    const caps = getPlayerCaps(player);
    const totalVP = (player.resources.glory || 0) + (player.resources.cardGlory || 0);

    const card = document.createElement('article');
    card.className = `hero-card ${isTurn ? 'is-active-turn' : ''}`;

    // Pending choices HTML
    const pendingChoices = player.lastRoll?.pendingChoices || [];
    let pendingHtml = '';
    if (pendingChoices.length > 0) {
      pendingHtml = `
        <div class="pending-choices-box">
          ${pendingChoices
            .map(
              (ch) => `
              <div class="choice-item">
                <span class="choice-prompt">✨ ${escapeHtml(ch.dieLabel)} — ${escapeHtml(ch.faceName)}:</span>
                <div class="choice-options">
                  ${ch.options
                    .map(
                      (opt, optIdx) => `
                      <button class="btn btn-gold btn-sm btn-resolve-choice"
                        data-player="${player.id}"
                        data-choice="${ch.choiceId}"
                        data-opt="${optIdx}">
                        ${escapeHtml(opt.label)}
                      </button>
                    `
                    )
                    .join('')}
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="hero-card-header">
        <div class="hero-identity">
          <span class="hero-color-badge" style="background:${player.color.hex}"></span>
          <span class="hero-title">${escapeHtml(player.name)}</span>
          <button class="btn-rename" data-player="${player.id}" title="Rename Hero">✏️</button>
          ${isTurn ? '<span class="active-hero-chip">Active Turn</span>' : ''}
        </div>
        <div class="hero-total-vp" title="Glory Track (${player.resources.glory}) + Heroic Feat Card Glory (${player.resources.cardGlory})">
          🏆 Total Score: ${totalVP} Glory
        </div>
      </div>

      <!-- Roll Action Bar -->
      <div class="hero-roll-bar">
        <div class="roll-buttons-group">
          <button class="btn btn-primary btn-sm btn-roll-player" data-player="${player.id}" data-mode="both" data-reason="Bonus / Ousted">
            🎲 Roll Both Dice
          </button>
          <button class="btn btn-secondary btn-sm btn-roll-player" data-player="${player.id}" data-mode="light" data-reason="Minor Blessing">
            ☀️ Roll Light
          </button>
          <button class="btn btn-secondary btn-sm btn-roll-player" data-player="${player.id}" data-mode="dark" data-reason="Minor Blessing">
            🌙 Roll Dark
          </button>
          <button class="btn btn-danger btn-xs btn-roll-minotaur" data-player="${player.id}" title="Minotaur Card: Roll both dice and LOSE rolled resources">
            🐂 Minotaur (-Roll)
          </button>
        </div>
        <div class="last-roll-banner">
          Last Roll: ${escapeHtml(player.lastRoll?.summary || 'Ready to roll')}
        </div>
      </div>

      ${pendingHtml}

      <!-- Resource Inventory Tracks -->
      <div class="resources-grid">
        ${renderResourceBox(player, 'gold', '🟡 Gold', player.resources.gold, caps.gold, 'fill-gold', 'res-gold')}
        ${renderResourceBox(player, 'sun', '🟠 Sun Shards', player.resources.sun, caps.sun, 'fill-sun', 'res-sun')}
        ${renderResourceBox(player, 'moon', '🟣 Moon Shards', player.resources.moon, caps.moon, 'fill-moon', 'res-moon')}
        ${renderResourceBox(player, 'glory', '🟢 Glory Track', player.resources.glory, null, '', 'res-glory')}
        ${renderResourceBox(player, 'cardGlory', '🃏 Feat Cards VP', player.resources.cardGlory, null, '', 'res-card-glory')}
      </div>

      <!-- Extras Bar: Blacksmith's Chests & Hammer -->
      <div class="hero-extras-bar">
        <div class="extra-item">
          <span>📦 <strong>Blacksmith's Chests:</strong> ${player.resources.chests || 0} <small class="res-cap">(Caps: ${caps.gold}G / ${caps.sun}S / ${caps.moon}M)</small></span>
          <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="chests" data-delta="-1">-</button>
          <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="chests" data-delta="1">+ Chest</button>
        </div>
        <div class="extra-item">
          <button class="btn btn-xs ${player.resources.hasHammer ? 'btn-gold' : 'btn-outline'} btn-toggle-hammer" data-player="${player.id}">
            🔨 Hammer ${player.resources.hasHammer ? `(${player.resources.hammerProgress || 0}/30)` : '(Off)'}
          </button>
          ${
            player.resources.hasHammer
              ? `
              <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="1">+1G</button>
              <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="3">+3G</button>
              <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="-1">-1</button>
            `
              : ''
          }
        </div>
      </div>

      <!-- Light & Dark Dice 6-Face Grids -->
      <div class="dice-section">
        <div class="die-panel light-die">
          <div class="die-panel-header">
            <span class="die-panel-title">☀️ Light Die (Tap any face to Forge)</span>
            <button class="btn btn-xs btn-gold-outline btn-open-forge-die" data-player="${player.id}" data-die="light">
              🔨 Forge Light
            </button>
          </div>
          <div class="die-faces-grid">
            ${player.lightDie
              .map((face, slotIdx) =>
                renderDieFaceTile(
                  player,
                  'light',
                  face,
                  slotIdx,
                  (player.lastRoll?.mode === 'both' || player.lastRoll?.mode === 'light') &&
                    player.lastRoll?.lightSlot === slotIdx
                )
              )
              .join('')}
          </div>
        </div>

        <div class="die-panel dark-die">
          <div class="die-panel-header">
            <span class="die-panel-title">🌙 Dark Die (Tap any face to Forge)</span>
            <button class="btn btn-xs btn-gold-outline btn-open-forge-die" data-player="${player.id}" data-die="dark">
              🔨 Forge Dark
            </button>
          </div>
          <div class="die-faces-grid">
            ${player.darkDie
              .map((face, slotIdx) =>
                renderDieFaceTile(
                  player,
                  'dark',
                  face,
                  slotIdx,
                  (player.lastRoll?.mode === 'both' || player.lastRoll?.mode === 'dark') &&
                    player.lastRoll?.darkSlot === slotIdx
                )
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    heroesContainer.appendChild(card);
  });

  bindHeroCardEvents();
}

function renderResourceBox(player, resourceKey, label, value, cap, fillClass, boxClass) {
  const pct = cap ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  return `
    <div class="res-box ${boxClass}">
      <div class="res-top">
        <span class="res-label">${label}</span>
        <span class="res-value">${value}${cap ? `<span class="res-cap">/${cap}</span>` : ''}</span>
      </div>
      ${
        cap
          ? `<div class="res-bar-track"><div class="res-bar-fill ${fillClass}" style="width:${pct}%"></div></div>`
          : ''
      }
      <div class="res-controls">
        <button class="btn-res btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="-5">-5</button>
        <button class="btn-res btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="-1">-1</button>
        <button class="btn-res btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="1">+1</button>
        <button class="btn-res btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="5">+5</button>
      </div>
    </div>
  `;
}

function renderDieFaceTile(player, dieType, face, slotIdx, isRolledActive) {
  const themeClass = `theme-${face.theme || 'gold'}`;
  return `
    <div class="die-face-tile ${themeClass} ${isRolledActive ? 'rolled-active' : ''}"
         data-player="${player.id}"
         data-die="${dieType}"
         data-slot="${slotIdx}"
         title="Tap to replace slot #${slotIdx + 1} (${escapeHtml(face.name)})">
      <span class="slot-num">#${slotIdx + 1}</span>
      ${isRolledActive ? '<span class="rolled-tag">Rolled</span>' : ''}
      <span class="face-name">${escapeHtml(face.name)}</span>
    </div>
  `;
}

function bindHeroCardEvents() {
  // Rename Hero
  document.querySelectorAll('.btn-rename').forEach((btn) => {
    btn.onclick = () => {
      const playerId = btn.dataset.player;
      const p = state.room.players.find((x) => x.id === playerId);
      const newName = prompt('Enter new Hero name:', p ? p.name : '');
      if (newName && newName.trim()) {
        socket.emit('rename_player', {
          roomCode: state.room.code,
          playerId,
          newName: newName.trim()
        });
      }
    };
  });

  // Roll Player Dice
  document.querySelectorAll('.btn-roll-player').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('roll_player_dice', {
        roomCode: state.room.code,
        playerId: btn.dataset.player,
        mode: btn.dataset.mode,
        isMinotaur: false,
        reason: btn.dataset.reason || ''
      });
    };
  });

  // Minotaur Roll
  document.querySelectorAll('.btn-roll-minotaur').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('roll_player_dice', {
        roomCode: state.room.code,
        playerId: btn.dataset.player,
        mode: 'both',
        isMinotaur: true,
        reason: 'Minotaur'
      });
    };
  });

  // Resolve Pending Roll Choice
  document.querySelectorAll('.btn-resolve-choice').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('resolve_roll_choice', {
        roomCode: state.room.code,
        playerId: btn.dataset.player,
        choiceId: btn.dataset.choice,
        optionIndex: Number(btn.dataset.opt)
      });
    };
  });

  // Resource +/- Adjustments
  document.querySelectorAll('.btn-res-adj').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('adjust_resource', {
        roomCode: state.room.code,
        playerId: btn.dataset.player,
        resource: btn.dataset.res,
        delta: Number(btn.dataset.delta)
      });
    };
  });

  // Toggle Hammer
  document.querySelectorAll('.btn-toggle-hammer').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('toggle_hammer', {
        roomCode: state.room.code,
        playerId: btn.dataset.player
      });
    };
  });

  // Open Forge Modal from Die Header or Die Face Tile
  document.querySelectorAll('.btn-open-forge-die').forEach((btn) => {
    btn.onclick = () => {
      openForgeModal(btn.dataset.player, btn.dataset.die, 0);
    };
  });

  document.querySelectorAll('.heroes-container .die-face-tile').forEach((tile) => {
    tile.onclick = () => {
      openForgeModal(tile.dataset.player, tile.dataset.die, Number(tile.dataset.slot));
    };
  });
}

function renderForgeModalContent() {
  const room = state.room;
  if (!room) return;

  // Populate player dropdown
  forgePlayerSelect.innerHTML = room.players
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.forgeModal.playerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    )
    .join('');

  const player = room.players.find((p) => p.id === state.forgeModal.playerId) || room.players[0];
  if (!player) return;
  state.forgeModal.playerId = player.id;

  forgePlayerGold.textContent = `🟡 ${player.resources.gold} Gold Available`;

  // Render Light & Dark Die slots inside Forge Modal
  forgeLightSlots.innerHTML = player.lightDie
    .map((face, idx) => {
      const isSelected = state.forgeModal.dieType === 'light' && state.forgeModal.slotIndex === idx;
      return `
        <div class="die-face-tile theme-${face.theme || 'gold'} ${isSelected ? 'selected-slot' : ''}"
             data-die="light" data-slot="${idx}">
          <span class="slot-num">#${idx + 1}</span>
          <span class="face-name">${escapeHtml(face.name)}</span>
        </div>
      `;
    })
    .join('');

  forgeDarkSlots.innerHTML = player.darkDie
    .map((face, idx) => {
      const isSelected = state.forgeModal.dieType === 'dark' && state.forgeModal.slotIndex === idx;
      return `
        <div class="die-face-tile theme-${face.theme || 'gold'} ${isSelected ? 'selected-slot' : ''}"
             data-die="dark" data-slot="${idx}">
          <span class="slot-num">#${idx + 1}</span>
          <span class="face-name">${escapeHtml(face.name)}</span>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('#forge-light-slots .die-face-tile, #forge-dark-slots .die-face-tile').forEach((el) => {
    el.onclick = () => {
      state.forgeModal.dieType = el.dataset.die;
      state.forgeModal.slotIndex = Number(el.dataset.slot);
      renderForgeModalContent();
    };
  });

  const targetDieName = state.forgeModal.dieType === 'dark' ? 'Dark Die' : 'Light Die';
  const targetFace =
    state.forgeModal.dieType === 'dark'
      ? player.darkDie[state.forgeModal.slotIndex]
      : player.lightDie[state.forgeModal.slotIndex];
  document.getElementById('forge-modal-subtitle').textContent = `Replacing ${player.name}'s ${targetDieName} Slot #${
    state.forgeModal.slotIndex + 1
  } (currently [${targetFace?.name || ''}])`;

  // Render Sanctuary Pools
  sanctuaryPoolsGrid.innerHTML = (room.sanctuary || [])
    .map((item) => {
      const depleted = item.remaining <= 0;
      return `
        <div class="sanctuary-card theme-${item.theme || 'gold'} ${depleted ? 'depleted' : ''}">
          <div class="sanctuary-card-top">
            <span class="cost-tag">🟡 ${item.cost} Gold</span>
            <span class="stock-tag">${item.remaining} / ${item.maxStock} left</span>
          </div>
          <div class="sanctuary-face-title">${escapeHtml(item.name)}</div>
          <button class="btn btn-gold btn-sm btn-buy-sanctuary" data-id="${item.id}" ${
        depleted && !forgeOverrideRule.checked ? 'disabled' : ''
      }>
            🔨 Forge onto ${targetDieName} #${state.forgeModal.slotIndex + 1}
          </button>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.btn-buy-sanctuary').forEach((btn) => {
    btn.onclick = () => {
      triggerForgeFace('sanctuary', btn.dataset.id);
    };
  });

  renderGardensCatalog(targetDieName);
}

function renderGardensCatalog(targetDieName = 'Selected Die') {
  if (!gardensFacesGrid) return;
  gardensFacesGrid.innerHTML = (state.catalog.gardenFaces || [])
    .map(
      (g) => `
      <div class="sanctuary-card theme-${g.theme || 'special'}">
        <div class="sanctuary-card-top">
          <span class="cost-tag">🃏 ${escapeHtml(g.cardName || 'Card Face')}</span>
        </div>
        <div class="sanctuary-face-title">${escapeHtml(g.name)}</div>
        <div class="sanctuary-face-desc">${escapeHtml(g.description || '')}</div>
        <button class="btn btn-primary btn-sm btn-forge-garden" data-id="${g.id}">
          🔨 Forge onto ${targetDieName} #${state.forgeModal.slotIndex + 1}
        </button>
      </div>
    `
    )
    .join('');

  document.querySelectorAll('.btn-forge-garden').forEach((btn) => {
    btn.onclick = () => {
      triggerForgeFace('garden', btn.dataset.id);
    };
  });
}

function renderActivityLog(room) {
  activityLog.innerHTML = (room.logs || [])
    .map(
      (entry) => `
      <div class="log-entry">
        <span class="log-time">${escapeHtml(entry.time)}</span>
        <span>${escapeHtml(entry.message)}</span>
      </div>
    `
    )
    .join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
