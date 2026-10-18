/* global io */
const socket = io();

const STORAGE_KEY = 'dice_forge_companion_session_v1';
const THEME_KEY = 'dice_forge_companion_theme_v1';

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
  theme: 'light',
  // Track last seen roll timestamps per player so we know when to trigger the suspenseful roll animation
  seenRollTimestamps: {},
  rollingPlayers: {}, // playerId -> { mode, lightTempFace, darkTempFace, landed }
  forgeModal: {
    isOpen: false,
    playerId: null,
    dieType: 'light',
    slotIndex: 0,
    activeTab: 'sanctuary'
  }
};

// Web Audio synthesizer for tactile dice ticks & landing chime (no external audio files needed)
let audioCtx = null;
function playDiceSound(type = 'tick') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    if (type === 'tick') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + Math.random() * 160, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.045);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'land') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.09, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.3);
      });
    }
  } catch (_) {}
}

// Theme initialization
function initTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark' || savedTheme === 'light') {
      state.theme = savedTheme;
    }
  } catch (_) {}
  applyTheme();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, state.theme);
  } catch (_) {}
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const toggleBtn = document.getElementById('btn-theme-toggle');
  const lobbyBtn = document.getElementById('btn-theme-lobby');
  if (toggleBtn) toggleBtn.textContent = state.theme === 'light' ? '🌙' : '☀️';
  if (lobbyBtn) lobbyBtn.textContent = state.theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
}
initTheme();

document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
document.getElementById('btn-theme-lobby')?.addEventListener('click', toggleTheme);

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
const btnUndo = document.getElementById('btn-undo');

const heroSwitcherPills = document.getElementById('hero-switcher-pills');
const btnToggleTableView = document.getElementById('btn-toggle-table-view');
const heroesContainer = document.getElementById('heroes-container');
const activityLog = document.getElementById('activity-log');
const latestLogPreview = document.getElementById('latest-log-preview');

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
  } catch (_) {}
}
initSessionCheck();

function saveSession(roomCode, playerId, playerName, isTableView = false) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomCode, playerId, playerName, isTableView }));
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
  socket.emit('join_room', { roomCode, playerName, existingPlayerId, asTableView }, (res) => {
    if (!res || !res.ok) {
      showLobbyError(res?.error || 'Could not join room.');
      return;
    }
    state.myPlayerId = res.playerId;
    state.focusedPlayerId = res.playerId;
    state.viewMode = asTableView ? 'table' : 'focused';
    saveSession(res.roomCode, res.playerId, playerName, asTableView);
    enterGameScreen(res.roomCode);
  });
}

function enterGameScreen(roomCode) {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  window.history.replaceState({}, '', url.toString());
}

// Suspenseful Dice Roll Animation Controller
function triggerSuspenseRollAnimation(playersWithNewRolls) {
  const stepDelays = [90, 190, 300, 430, 580, 760, 960];

  playersWithNewRolls.forEach((player) => {
    state.rollingPlayers[player.id] = {
      mode: player.lastRoll.mode || 'both',
      lightTempFace: player.lightDie[Math.floor(Math.random() * 6)],
      darkTempFace: player.darkDie[Math.floor(Math.random() * 6)],
      landed: false
    };
  });

  stepDelays.forEach((delay) => {
    setTimeout(() => {
      playDiceSound('tick');
      playersWithNewRolls.forEach((player) => {
        const anim = state.rollingPlayers[player.id];
        if (!anim || anim.landed) return;
        anim.lightTempFace = player.lightDie[Math.floor(Math.random() * 6)];
        anim.darkTempFace = player.darkDie[Math.floor(Math.random() * 6)];
      });
      renderHeroesMain(state.room);
    }, delay);
  });

  // Final landing at 1150ms
  setTimeout(() => {
    playDiceSound('land');
    playersWithNewRolls.forEach((player) => {
      state.rollingPlayers[player.id] = { landed: true };
    });
    renderAll();

    // Clear landed pop class after 650ms
    setTimeout(() => {
      playersWithNewRolls.forEach((player) => {
        delete state.rollingPlayers[player.id];
      });
    }, 650);
  }, 1150);
}

// Receive live room state
socket.on('room_state', (roomData) => {
  const isFirstLoad = !state.room;
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

  // Detect any player whose roll timestamp is newer than what we've seen
  const newlyRolledPlayers = [];
  roomData.players.forEach((p) => {
    const ts = p.lastRoll?.timestamp || 0;
    const prevTs = state.seenRollTimestamps[p.id] || 0;
    if (!isFirstLoad && ts > prevTs) {
      newlyRolledPlayers.push(p);
    }
    state.seenRollTimestamps[p.id] = ts;
  });

  if (newlyRolledPlayers.length > 0) {
    triggerSuspenseRollAnimation(newlyRolledPlayers);
  }

  renderAll();
});

// Auto-rejoin on socket reconnect
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

// Topbar & Navigation controls
document.getElementById('btn-copy-room').addEventListener('click', () => {
  if (!state.room) return;
  const inviteUrl = `${window.location.origin}/?room=${state.room.code}`;
  navigator.clipboard?.writeText(inviteUrl);
  const hint = document.querySelector('#btn-copy-room .copy-hint');
  hint.textContent = '✅';
  setTimeout(() => {
    hint.textContent = '🔗';
  }, 1600);
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

btnToggleTableView.addEventListener('click', () => {
  state.viewMode = state.viewMode === 'table' ? 'focused' : 'table';
  renderAll();
});

document.getElementById('btn-add-seat').addEventListener('click', () => {
  if (!state.room) return;
  const nextNum = state.room.players.length + 1;
  const name = prompt(`Enter name for Hero ${nextNum}:`, `Hero ${nextNum}`);
  if (name === null) return;
  socket.emit('add_player_seat', { roomCode: state.room.code, playerName: name.trim() || `Hero ${nextNum}` }, (res) => {
    if (res && res.ok && res.playerId) {
      state.focusedPlayerId = res.playerId;
      state.viewMode = 'focused';
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

// Forge Modal Controls
document.getElementById('btn-close-forge').addEventListener('click', closeForgeModal);
forgePlayerSelect.addEventListener('change', () => {
  state.forgeModal.playerId = forgePlayerSelect.value;
  renderForgeModalContent();
});
forgeOverrideRule.addEventListener('change', renderForgeModalContent);
forgeShipDiscount.addEventListener('change', renderForgeModalContent);

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

// Helper for face icon display on the big 3D dice cubes
function getFaceIcon(face) {
  if (!face) return '🎲';
  if (face.kind === 'multiplier') return '×3';
  if (face.kind === 'mirror') return '🪞';
  if (face.isBoar) return '🐗';
  if (face.kind === 'shield') return '🛡️';
  if (face.id === 'g_ship') return '⛵';
  if (face.kind === 'choice') return '✨';
  const r = face.rewards || {};
  const icons = [];
  if (r.gold) icons.push('🟡');
  if (r.sun) icons.push('🟠');
  if (r.moon) icons.push('🟣');
  if (r.glory) icons.push('🟢');
  return icons.join('') || '🎲';
}

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
    room.round > room.maxRounds ? `Final (${room.maxRounds}/${room.maxRounds})` : `Rd ${room.round}/${room.maxRounds}`;

  const activePlayer = room.players[room.activePlayerIndex];
  displayActiveHero.textContent = activePlayer ? activePlayer.name : 'Waiting';

  blessingCountBadge.textContent = `${room.divineBlessingsRemainingInTurn}x`;

  btnUndo.disabled = !room.canUndo;
  btnUndo.title = room.lastUndoLabel ? `Undo: ${room.lastUndoLabel}` : 'Nothing to undo';

  document.getElementById('btn-add-seat').classList.toggle('hidden', room.players.length >= 4);
  btnToggleTableView.classList.toggle('active', state.viewMode === 'table');

  renderHeroSwitcherPills(room);
  renderHeroesMain(room);
  renderActivityLog(room);

  if (state.forgeModal.isOpen) {
    renderForgeModalContent();
  }
}

function renderHeroSwitcherPills(room) {
  heroSwitcherPills.innerHTML = '';
  room.players.forEach((p, idx) => {
    const totalVP = (p.resources.glory || 0) + (p.resources.cardGlory || 0);
    const hasChoice = (p.lastRoll?.pendingChoices || []).length > 0;
    const isFocused = state.viewMode === 'focused' && p.id === state.focusedPlayerId;
    const btn = document.createElement('button');
    btn.className = `hero-pill ${isFocused ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="color-dot" style="background:${p.color.hex}"></span>
      <span>${escapeHtml(p.name)}</span>
      <span class="hero-pill-vp">${totalVP}★</span>
      ${idx === room.activePlayerIndex ? '<span title="Active Turn">⚡</span>' : ''}
      ${hasChoice ? '<span title="Pending Roll Choice">⚠️</span>' : ''}
    `;
    btn.onclick = () => {
      state.focusedPlayerId = p.id;
      state.viewMode = 'focused';
      renderAll();
    };
    heroSwitcherPills.appendChild(btn);
  });
}

function renderHeroesMain(room) {
  if (!room) return;
  heroesContainer.innerHTML = '';
  heroesContainer.classList.toggle('table-grid', state.viewMode === 'table');

  if (room.players.length === 0) {
    heroesContainer.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;">
        <h3>Waiting for Heroes</h3>
        <p class="card-desc">Tap "+ Hero" above or join with room code <strong>${room.code}</strong>.</p>
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
    const totalStock = (room.sanctuary || []).reduce((acc, s) => acc + (s.remaining || 0), 0);

    // Check if this player is currently in the middle of the suspenseful roll animation
    const animState = state.rollingPlayers[player.id];
    const isCurrentlyRolling = animState && !animState.landed;
    const justLanded = animState && animState.landed;

    const rollMode = player.lastRoll?.mode || 'both';
    const rolledLightFace = isCurrentlyRolling
      ? animState.lightTempFace
      : player.lightDie[player.lastRoll?.lightSlot || 0];
    const rolledDarkFace = isCurrentlyRolling
      ? animState.darkTempFace
      : player.darkDie[player.lastRoll?.darkSlot || 0];

    const lightRollingClass =
      isCurrentlyRolling && (rollMode === 'both' || rollMode === 'light')
        ? 'is-rolling'
        : justLanded && (rollMode === 'both' || rollMode === 'light')
        ? 'just-landed'
        : '';
    const darkRollingClass =
      isCurrentlyRolling && (rollMode === 'both' || rollMode === 'dark')
        ? 'is-rolling'
        : justLanded && (rollMode === 'both' || rollMode === 'dark')
        ? 'just-landed'
        : '';

    const lightInactive = rollMode === 'dark' ? 'inactive-die' : '';
    const darkInactive = rollMode === 'light' ? 'inactive-die' : '';

    // Pending choices HTML (only show once the dice have landed!)
    const pendingChoices = !isCurrentlyRolling ? player.lastRoll?.pendingChoices || [] : [];
    let pendingHtml = '';
    if (pendingChoices.length > 0) {
      pendingHtml = `
        <div class="pending-choices-box">
          ${pendingChoices
            .map(
              (ch) => `
              <div class="choice-item">
                <span class="choice-prompt">✨ ${escapeHtml(ch.dieLabel)} (${escapeHtml(ch.faceName)}) — Pick reward:</span>
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

    const card = document.createElement('article');
    card.className = `hero-card ${isTurn ? 'is-active-turn' : ''}`;

    card.innerHTML = `
      <!-- Clean Header -->
      <div class="hero-card-header">
        <div class="hero-identity">
          <span class="hero-color-badge" style="background:${player.color.hex}"></span>
          <span class="hero-title">${escapeHtml(player.name)}</span>
          <button class="btn-rename" data-player="${player.id}" title="Rename Hero">✏️</button>
        </div>
        <div class="hero-total-vp" title="Glory Track (${player.resources.glory}) + Feat Cards (${player.resources.cardGlory})">
          🏆 ${totalVP} Glory
        </div>
      </div>

      <!-- SECTION 1: THE DICE ROLL ARENA -->
      <div class="dice-arena">
        <div class="dice-stage">
          <div class="big-die-wrap">
            <span class="big-die-label">☀️ Light Die</span>
            <div class="big-die-cube light-cube ${lightRollingClass} ${lightInactive} btn-roll-single-cube"
                 data-player="${player.id}" data-mode="both" title="Tap to roll both dice">
              <div class="big-die-icon">${getFaceIcon(rolledLightFace)}</div>
              <div class="big-die-face-text">${escapeHtml(rolledLightFace?.name || '1 Gold')}</div>
            </div>
          </div>

          <div class="big-die-wrap">
            <span class="big-die-label">🌙 Dark Die</span>
            <div class="big-die-cube dark-cube ${darkRollingClass} ${darkInactive} btn-roll-single-cube"
                 data-player="${player.id}" data-mode="both" title="Tap to roll both dice">
              <div class="big-die-icon">${getFaceIcon(rolledDarkFace)}</div>
              <div class="big-die-face-text">${escapeHtml(rolledDarkFace?.name || '1 Gold')}</div>
            </div>
          </div>
        </div>

        <div class="roll-outcome-pill">
          ${isCurrentlyRolling ? '🎲 Rolling the Divine Dice...' : escapeHtml(player.lastRoll?.summary || 'Tap Roll below to begin')}
        </div>

        <div class="arena-roll-buttons">
          <button class="btn btn-primary btn-sm btn-roll-player" data-player="${player.id}" data-mode="both" data-reason="Roll Both">
            🎲 Roll Both
          </button>
          <button class="btn btn-outline btn-sm btn-roll-player" data-player="${player.id}" data-mode="light" data-reason="Minor Blessing">
            ☀️ Light Only
          </button>
          <button class="btn btn-outline btn-sm btn-roll-player" data-player="${player.id}" data-mode="dark" data-reason="Minor Blessing">
            🌙 Dark Only
          </button>
          <button class="btn btn-gold btn-sm btn-open-forge-die" data-player="${player.id}" data-die="light">
            🏛️ Forge Dice (${totalStock})
          </button>
        </div>
      </div>

      ${pendingHtml}

      <!-- SECTION 2: STREAMLINED 4-RESOURCE INVENTORY -->
      <div class="inventory-grid">
        ${renderInventoryCard(player, 'gold', '🟡 Gold', player.resources.gold, caps.gold, 'fill-gold', 'res-gold')}
        ${renderInventoryCard(player, 'sun', '🟠 Sun', player.resources.sun, caps.sun, 'fill-sun', 'res-sun')}
        ${renderInventoryCard(player, 'moon', '🟣 Moon', player.resources.moon, caps.moon, 'fill-moon', 'res-moon')}
        ${renderInventoryCard(player, 'glory', '🟢 Glory', player.resources.glory, null, 'fill-glory', 'res-glory')}
      </div>

      <!-- SECTION 3: MY 12 DIE FACES -->
      <div class="dice-faces-panel">
        <div class="dice-faces-header">
          <span class="dice-faces-title">My Dice Faces (Tap any slot to Forge)</span>
        </div>
        <div class="dice-section">
          <div class="die-panel">
            <div class="die-panel-header">
              <span>☀️ Light Die</span>
            </div>
            <div class="die-faces-grid">
              ${player.lightDie
                .map((face, slotIdx) =>
                  renderDieFaceTile(
                    player,
                    'light',
                    face,
                    slotIdx,
                    !isCurrentlyRolling &&
                      (player.lastRoll?.mode === 'both' || player.lastRoll?.mode === 'light') &&
                      player.lastRoll?.lightSlot === slotIdx
                  )
                )
                .join('')}
            </div>
          </div>

          <div class="die-panel">
            <div class="die-panel-header">
              <span>🌙 Dark Die</span>
            </div>
            <div class="die-faces-grid">
              ${player.darkDie
                .map((face, slotIdx) =>
                  renderDieFaceTile(
                    player,
                    'dark',
                    face,
                    slotIdx,
                    !isCurrentlyRolling &&
                      (player.lastRoll?.mode === 'both' || player.lastRoll?.mode === 'dark') &&
                      player.lastRoll?.darkSlot === slotIdx
                  )
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- COLLAPSIBLE EXTRAS: Feat Card VP, Chests, Hammer, Minotaur -->
      <details class="extras-drawer">
        <summary>
          <span>🎒 Card Glory (${player.resources.cardGlory || 0} VP) • Chests (${player.resources.chests || 0}) • Hammer &amp; More</span>
          <span>▾</span>
        </summary>
        <div class="extras-body">
          <div class="extra-item">
            <strong>🃏 Feat Cards VP: ${player.resources.cardGlory || 0}</strong>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="cardGlory" data-delta="-2">-2</button>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="cardGlory" data-delta="-1">-1</button>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="cardGlory" data-delta="2">+2</button>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="cardGlory" data-delta="4">+4</button>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="cardGlory" data-delta="6">+6</button>
          </div>

          <div class="extra-item">
            <span>📦 <strong>Chests: ${player.resources.chests || 0}</strong> <small>(Caps: ${caps.gold}G/${caps.sun}S/${caps.moon}M)</small></span>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="chests" data-delta="-1">−</button>
            <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="chests" data-delta="1">+ Chest</button>
          </div>

          <div class="extra-item">
            <button class="btn btn-xs ${player.resources.hasHammer ? 'btn-gold' : 'btn-outline'} btn-toggle-hammer" data-player="${player.id}">
              🔨 Hammer ${player.resources.hasHammer ? `(${player.resources.hammerProgress || 0}/30)` : '(Enable)'}
            </button>
            ${
              player.resources.hasHammer
                ? `
                <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="1">+1G</button>
                <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="3">+3G</button>
                <button class="btn btn-xs btn-outline btn-res-adj" data-player="${player.id}" data-res="hammerProgress" data-delta="-1">−1</button>
              `
                : ''
            }
          </div>

          <div class="extra-item">
            <button class="btn btn-danger btn-xs btn-roll-minotaur" data-player="${player.id}" title="Roll both dice and subtract resources">
              🐂 Minotaur Roll (-Resources)
            </button>
          </div>
        </div>
      </details>
    `;

    heroesContainer.appendChild(card);
  });

  bindHeroCardEvents();
}

function renderInventoryCard(player, resourceKey, label, value, cap, fillClass, boxClass) {
  const pct = cap ? Math.min(100, Math.round((value / cap) * 100)) : 100;
  return `
    <div class="inv-card ${boxClass}">
      <div class="inv-header">
        <span class="inv-label">${label}</span>
        <span class="inv-val">${value}${cap ? `<span class="inv-cap">/${cap}</span>` : ''}</span>
      </div>
      <div class="res-bar-track">
        <div class="res-bar-fill ${fillClass}" style="width:${pct}%"></div>
      </div>
      <div class="inv-stepper">
        <button class="btn-step btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="-1">−</button>
        <button class="btn-step btn-res-adj" data-player="${player.id}" data-res="${resourceKey}" data-delta="1">+</button>
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
         title="Tap to forge over slot #${slotIdx + 1} (${escapeHtml(face.name)})">
      <span class="slot-num">${slotIdx + 1}</span>
      <span class="face-name">${escapeHtml(face.name)}</span>
    </div>
  `;
}

function bindHeroCardEvents() {
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

  document.querySelectorAll('.btn-roll-player, .btn-roll-single-cube').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('roll_player_dice', {
        roomCode: state.room.code,
        playerId: btn.dataset.player,
        mode: btn.dataset.mode || 'both',
        isMinotaur: false,
        reason: btn.dataset.reason || ''
      });
    };
  });

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

  document.querySelectorAll('.btn-toggle-hammer').forEach((btn) => {
    btn.onclick = () => {
      socket.emit('toggle_hammer', {
        roomCode: state.room.code,
        playerId: btn.dataset.player
      });
    };
  });

  document.querySelectorAll('.btn-open-forge-die').forEach((btn) => {
    btn.onclick = () => {
      openForgeModal(btn.dataset.player, btn.dataset.die || 'light', 0);
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

  forgePlayerSelect.innerHTML = room.players
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.forgeModal.playerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    )
    .join('');

  const player = room.players.find((p) => p.id === state.forgeModal.playerId) || room.players[0];
  if (!player) return;
  state.forgeModal.playerId = player.id;

  forgePlayerGold.textContent = `🟡 ${player.resources.gold} Gold`;

  forgeLightSlots.innerHTML = player.lightDie
    .map((face, idx) => {
      const isSelected = state.forgeModal.dieType === 'light' && state.forgeModal.slotIndex === idx;
      return `
        <div class="die-face-tile theme-${face.theme || 'gold'} ${isSelected ? 'selected-slot' : ''}"
             data-die="light" data-slot="${idx}">
          <span class="slot-num">${idx + 1}</span>
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
          <span class="slot-num">${idx + 1}</span>
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
  document.getElementById('forge-modal-subtitle').textContent = `Replacing ${player.name}'s ${targetDieName} #${
    state.forgeModal.slotIndex + 1
  } (${targetFace?.name || ''})`;

  sanctuaryPoolsGrid.innerHTML = (room.sanctuary || [])
    .map((item) => {
      const depleted = item.remaining <= 0;
      return `
        <div class="sanctuary-card theme-${item.theme || 'gold'} ${depleted ? 'depleted' : ''}">
          <div class="sanctuary-card-top">
            <span class="cost-tag">🟡 ${item.cost}G</span>
            <span class="stock-tag">${item.remaining}/${item.maxStock} left</span>
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

function renderGardensCatalog(targetDieName = 'Die') {
  if (!gardensFacesGrid) return;
  gardensFacesGrid.innerHTML = (state.catalog.gardenFaces || [])
    .map(
      (g) => `
      <div class="sanctuary-card theme-${g.theme || 'special'}">
        <div class="sanctuary-card-top">
          <span class="cost-tag">🃏 ${escapeHtml(g.cardName || 'Card')}</span>
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
  const logs = room.logs || [];
  if (latestLogPreview) {
    latestLogPreview.textContent = logs.length > 0 ? `— ${logs[0].message}` : '';
  }
  activityLog.innerHTML = logs
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
