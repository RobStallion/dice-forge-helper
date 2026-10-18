const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const {
  SANCTUARY_POOLS,
  GARDEN_FACES,
  PLAYER_COLORS,
  buildSanctuarySupply,
  createStartingPlayer
} = require('./gameData');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Health check & keep-alive endpoint (prevents free-tier sleep while a tab is open)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size });
});

// Expose catalog endpoint for clients
app.get('/api/catalog', (req, res) => {
  res.json({
    sanctuaryPools: SANCTUARY_POOLS,
    gardenFaces: GARDEN_FACES,
    playerColors: PLAYER_COLORS
  });
});

// In-memory store of rooms
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getPlayerCaps(player) {
  const chests = Number(player.resources.chests) || 0;
  return {
    gold: 12 + chests * 4,
    sun: 6 + chests * 3,
    moon: 6 + chests * 3
  };
}

function formatRewards(rewards, multiplier = 1, isMinotaur = false) {
  const parts = [];
  const sign = isMinotaur ? '-' : '+';
  if (rewards.gold) parts.push(`${sign}${rewards.gold * multiplier} Gold`);
  if (rewards.sun) parts.push(`${sign}${rewards.sun * multiplier} Sun`);
  if (rewards.moon) parts.push(`${sign}${rewards.moon * multiplier} Moon`);
  if (rewards.glory) parts.push(`${sign}${rewards.glory * multiplier} Glory`);
  return parts.length ? parts.join(', ') : 'No resources';
}

function applyRewardsToPlayer(player, rewards, multiplier = 1, isMinotaur = false) {
  const caps = getPlayerCaps(player);
  const delta = {
    gold: (rewards.gold || 0) * multiplier,
    sun: (rewards.sun || 0) * multiplier,
    moon: (rewards.moon || 0) * multiplier,
    glory: (rewards.glory || 0) * multiplier
  };

  let overflowGold = 0;

  if (isMinotaur) {
    // Minotaur causes loss of resources (cannot go below 0)
    player.resources.gold = Math.max(0, player.resources.gold - delta.gold);
    player.resources.sun = Math.max(0, player.resources.sun - delta.sun);
    player.resources.moon = Math.max(0, player.resources.moon - delta.moon);
    player.resources.glory = Math.max(0, player.resources.glory - delta.glory);
  } else {
    const newGold = player.resources.gold + delta.gold;
    if (newGold > caps.gold) {
      overflowGold = newGold - caps.gold;
    }
    player.resources.gold = Math.min(caps.gold, newGold);
    player.resources.sun = Math.min(caps.sun, player.resources.sun + delta.sun);
    player.resources.moon = Math.min(caps.moon, player.resources.moon + delta.moon);
    player.resources.glory += delta.glory;
  }

  return {
    appliedText: formatRewards(rewards, multiplier, isMinotaur),
    overflowGold
  };
}

function saveUndoSnapshot(room, actionLabel) {
  const snapshot = JSON.stringify({
    players: room.players,
    sanctuary: room.sanctuary,
    round: room.round,
    maxRounds: room.maxRounds,
    activePlayerIndex: room.activePlayerIndex,
    divineBlessingsRemainingInTurn: room.divineBlessingsRemainingInTurn
  });
  room.undoStack.push({ snapshot, actionLabel });
  if (room.undoStack.length > 25) {
    room.undoStack.shift();
  }
}

function addLog(room, message, type = 'info') {
  room.logs.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
    type
  });
  if (room.logs.length > 60) {
    room.logs.length = 60;
  }
}

function rollSinglePlayerDice(room, player, mode = 'both', isMinotaur = false) {
  // mode: 'both' | 'light' | 'dark'
  const lightSlot = mode === 'both' || mode === 'light' ? Math.floor(Math.random() * 6) : player.lastRoll.lightSlot;
  const darkSlot = mode === 'both' || mode === 'dark' ? Math.floor(Math.random() * 6) : player.lastRoll.darkSlot;

  const lightFace = mode === 'both' || mode === 'light' ? player.lightDie[lightSlot] : null;
  const darkFace = mode === 'both' || mode === 'dark' ? player.darkDie[darkSlot] : null;

  const pendingChoices = [];
  const summaryParts = [];

  if (mode === 'both') {
    const isLightX3 = lightFace.kind === 'multiplier';
    const isDarkX3 = darkFace.kind === 'multiplier';

    if (isLightX3 && isDarkX3) {
      summaryParts.push('Rolled ×3 + ×3 (No effect)');
    } else if (isLightX3 || isDarkX3) {
      const targetFace = isLightX3 ? darkFace : lightFace;
      const targetDieLabel = isLightX3 ? 'Dark Die' : 'Light Die';
      summaryParts.push(`×3 Multiplier on ${targetFace.name}`);
      resolveFaceEffect(room, player, targetFace, targetDieLabel, 3, isMinotaur, null, pendingChoices, summaryParts);
    } else {
      resolveFaceEffect(room, player, lightFace, 'Light Die', 1, isMinotaur, darkFace, pendingChoices, summaryParts);
      resolveFaceEffect(room, player, darkFace, 'Dark Die', 1, isMinotaur, lightFace, pendingChoices, summaryParts);
    }
  } else {
    const singleFace = mode === 'light' ? lightFace : darkFace;
    const dieLabel = mode === 'light' ? 'Light Die' : 'Dark Die';
    if (singleFace.kind === 'multiplier') {
      summaryParts.push(`${dieLabel}: ×3 (No other die rolled)`);
    } else {
      resolveFaceEffect(room, player, singleFace, dieLabel, 1, isMinotaur, null, pendingChoices, summaryParts);
    }
  }

  player.lastRoll = {
    lightSlot,
    darkSlot,
    mode,
    isMinotaur: !!isMinotaur,
    timestamp: Date.now(),
    summary: summaryParts.join(' • ') || 'Rolled',
    pendingChoices
  };

  return player.lastRoll;
}

function resolveFaceEffect(room, player, face, dieLabel, multiplier, isMinotaur, otherFace, pendingChoices, summaryParts) {
  if (!face) return;

  if (face.kind === 'fixed') {
    const res = applyRewardsToPlayer(player, face.rewards, multiplier, isMinotaur);
    let text = `${face.name} (${res.appliedText})`;
    if (res.overflowGold > 0 && player.resources.hasHammer) {
      text += ` [🔨 +${res.overflowGold} overflow Gold available for Hammer]`;
    }
    summaryParts.push(text);
    return;
  }

  if (face.kind === 'shield') {
    // Check if otherFace unambiguously grants the matching resource
    if (otherFace && otherFace.kind === 'fixed') {
      const hasMatch = (otherFace.rewards[face.matchResource] || 0) > 0;
      const chosenRewards = hasMatch ? face.matchRewards : face.baseRewards;
      const res = applyRewardsToPlayer(player, chosenRewards, multiplier, isMinotaur);
      summaryParts.push(`${face.name} → ${hasMatch ? 'Matched!' : 'Base'} (${res.appliedText})`);
      return;
    }
    // Otherwise prompt player to choose whether it matched
    pendingChoices.push({
      choiceId: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dieLabel,
      faceName: face.name,
      multiplier,
      isMinotaur,
      isBoar: false,
      options: face.choices.map((c) => ({
        label: multiplier > 1 ? `${c.label} (×${multiplier})` : c.label,
        rewards: c.rewards,
        note: c.note || null
      }))
    });
    summaryParts.push(`${face.name} (Choose outcome)`);
    return;
  }

  if (face.kind === 'choice') {
    pendingChoices.push({
      choiceId: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dieLabel,
      faceName: face.name,
      multiplier,
      isMinotaur,
      isBoar: !!face.isBoar,
      options: face.choices.map((c) => {
        const baseLabel = isMinotaur ? c.label.replace(/\+/g, '−') : c.label;
        return {
          label: multiplier > 1 ? `${baseLabel} (×${multiplier})` : baseLabel,
          rewards: c.rewards,
          note: c.note || null
        };
      })
    });
    summaryParts.push(
      isMinotaur
        ? `${face.name} (Choose resource to lose)`
        : face.isBoar
        ? `🐗 Tenacious Boar! (Choose reward + Boar owner gets reward)`
        : `${face.name} (Choose reward)`
    );
    return;
  }

  if (face.kind === 'mirror') {
    // Gather all currently showing opponent die faces so the player can copy any one of them
    const mirrorOptions = [];
    for (const otherPlayer of room.players) {
      if (otherPlayer.id === player.id) continue;
      const pLight = otherPlayer.lightDie[otherPlayer.lastRoll?.lightSlot || 0];
      const pDark = otherPlayer.darkDie[otherPlayer.lastRoll?.darkSlot || 0];
      [
        { die: 'Light', f: pLight },
        { die: 'Dark', f: pDark }
      ].forEach(({ die, f }) => {
        if (!f) return;
        if (f.kind === 'fixed') {
          mirrorOptions.push({
            label: `Copy ${otherPlayer.name}'s ${die}: ${f.name}${multiplier > 1 ? ` (×${multiplier})` : ''}`,
            rewards: f.rewards
          });
        } else if (f.kind === 'choice' && f.choices) {
          f.choices.forEach((ch) => {
            mirrorOptions.push({
              label: `Copy ${otherPlayer.name}'s ${f.name}: ${ch.label}${multiplier > 1 ? ` (×${multiplier})` : ''}`,
              rewards: ch.rewards
            });
          });
        }
      });
    }

    // Fallback standard options if no opponents have rolled yet
    if (mirrorOptions.length === 0) {
      mirrorOptions.push(
        { label: `+1 Gold${multiplier > 1 ? ` (×${multiplier})` : ''}`, rewards: { gold: 1 } },
        { label: `+1 Sun${multiplier > 1 ? ` (×${multiplier})` : ''}`, rewards: { sun: 1 } },
        { label: `+1 Moon${multiplier > 1 ? ` (×${multiplier})` : ''}`, rewards: { moon: 1 } },
        { label: `+2 Glory${multiplier > 1 ? ` (×${multiplier})` : ''}`, rewards: { glory: 2 } }
      );
    }

    pendingChoices.push({
      choiceId: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dieLabel,
      faceName: 'Mirror of the Abyss',
      multiplier,
      isMinotaur,
      isBoar: false,
      options: mirrorOptions
    });
    summaryParts.push(`Mirror of the Abyss (Pick an opponent's face to copy)`);
  }
}

function createRoomState(code, setupPlayerCount = 4) {
  const count = Math.min(4, Math.max(2, Number(setupPlayerCount) || 4));
  const maxRounds = count === 3 ? 10 : 9;
  return {
    code,
    setupPlayerCount: count,
    round: 1,
    maxRounds,
    activePlayerIndex: 0,
    divineBlessingsRemainingInTurn: count === 2 ? 2 : 1,
    players: [],
    sanctuary: buildSanctuarySupply(count),
    logs: [],
    undoStack: [],
    createdAt: Date.now()
  };
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room_state', {
    code: room.code,
    setupPlayerCount: room.setupPlayerCount,
    round: room.round,
    maxRounds: room.maxRounds,
    activePlayerIndex: room.activePlayerIndex,
    divineBlessingsRemainingInTurn: room.divineBlessingsRemainingInTurn,
    players: room.players,
    sanctuary: room.sanctuary,
    logs: room.logs,
    canUndo: room.undoStack.length > 0,
    lastUndoLabel: room.undoStack.length > 0 ? room.undoStack[room.undoStack.length - 1].actionLabel : null
  });
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName, playerCount = 4, asTableView = false }, callback) => {
    const code = generateRoomCode();
    const room = createRoomState(code, playerCount);

    let playerId = null;
    if (!asTableView) {
      playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newPlayer = createStartingPlayer(0, playerName || 'Hero 1', PLAYER_COLORS[0], playerId);
      room.players.push(newPlayer);
      addLog(room, `${newPlayer.name} created room ${code} (${room.setupPlayerCount}-player setup).`, 'system');
    } else {
      addLog(room, `Table Display created room ${code} (${room.setupPlayerCount}-player setup).`, 'system');
    }

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;

    broadcastRoom(code);
    if (callback) callback({ ok: true, roomCode: code, playerId });
  });

  socket.on('join_room', ({ roomCode, playerName, existingPlayerId, asTableView = false }, callback) => {
    const code = (roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ ok: false, error: `Room "${code}" not found.` });
      return;
    }

    socket.join(code);
    socket.data.roomCode = code;

    if (asTableView) {
      broadcastRoom(code);
      if (callback) callback({ ok: true, roomCode: code, playerId: null, isTableView: true });
      return;
    }

    // Check if reconnecting with existingPlayerId or matching name
    let player = room.players.find((p) => p.id === existingPlayerId);
    if (!player && playerName) {
      player = room.players.find((p) => p.name.toLowerCase() === playerName.trim().toLowerCase());
    }

    if (!player) {
      if (room.players.length >= 4) {
        if (callback) {
          callback({
            ok: false,
            error: 'Room already has 4 heroes! You can join in Shared Table View or tap an existing Hero name to reconnect.'
          });
        }
        return;
      }
      const seatIndex = room.players.length;
      const usedColors = new Set(room.players.map((p) => p.color.id));
      const availableColor = PLAYER_COLORS.find((c) => !usedColors.has(c.id)) || PLAYER_COLORS[seatIndex];
      const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      player = createStartingPlayer(seatIndex, playerName || `Hero ${seatIndex + 1}`, availableColor, playerId);
      room.players.push(player);
      addLog(room, `${player.name} joined as Player ${seatIndex + 1} (starts with ${player.resources.gold} Gold).`, 'system');
    }

    socket.data.playerId = player.id;
    broadcastRoom(code);
    if (callback) callback({ ok: true, roomCode: code, playerId: player.id });
  });

  // Add a player slot directly from the UI (great when playing with fewer phones than players)
  socket.on('add_player_seat', ({ roomCode, playerName }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.players.length >= 4) {
      if (callback) callback({ ok: false, error: 'Maximum of 4 players reached.' });
      return;
    }
    saveUndoSnapshot(room, 'Add Player');
    const seatIndex = room.players.length;
    const usedColors = new Set(room.players.map((p) => p.color.id));
    const availableColor = PLAYER_COLORS.find((c) => !usedColors.has(c.id)) || PLAYER_COLORS[seatIndex];
    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newPlayer = createStartingPlayer(seatIndex, playerName || `Hero ${seatIndex + 1}`, availableColor, playerId);
    room.players.push(newPlayer);
    addLog(room, `Added ${newPlayer.name} (starts with ${newPlayer.resources.gold} Gold).`, 'system');
    broadcastRoom(roomCode);
    if (callback) callback({ ok: true, playerId });
  });

  // Change setup player count (2P / 3P / 4P) and reset Sanctuary stock accordingly
  socket.on('set_player_count_setup', ({ roomCode, playerCount }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    saveUndoSnapshot(room, `Switch to ${playerCount}P Setup`);
    const count = Math.min(4, Math.max(2, Number(playerCount) || 4));
    room.setupPlayerCount = count;
    room.maxRounds = count === 3 ? 10 : 9;
    room.divineBlessingsRemainingInTurn = count === 2 ? 2 : 1;
    room.sanctuary = buildSanctuarySupply(count);
    addLog(
      room,
      `Switched Temple Sanctuary setup to ${count} Players (${count === 2 ? '2 faces per pool, 2 Divine Blessings per turn' : '4 faces per pool'}).`,
      'system'
    );
    broadcastRoom(roomCode);
  });

  // Roll all players' dice (Divine Blessing at start of turn)
  socket.on('roll_all_divine_blessing', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.players.length === 0) return;

    saveUndoSnapshot(room, 'Divine Blessing (Roll All)');
    const summaries = [];
    for (const player of room.players) {
      const result = rollSinglePlayerDice(room, player, 'both', false);
      summaries.push(`${player.name}: ${result.summary}`);
    }
    if (room.divineBlessingsRemainingInTurn > 0) {
      room.divineBlessingsRemainingInTurn -= 1;
    }
    addLog(room, `⚡ Divine Blessing! ${summaries.join(' | ')}`, 'roll');
    broadcastRoom(roomCode);
  });

  // Roll a single player's dice ('both', 'light', or 'dark', plus optional Minotaur mode)
  socket.on('roll_player_dice', ({ roomCode, playerId, mode = 'both', isMinotaur = false, reason = '' }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    saveUndoSnapshot(room, `${player.name} Roll`);
    const result = rollSinglePlayerDice(room, player, mode, isMinotaur);
    const label = isMinotaur
      ? `🐂 Minotaur Roll for ${player.name}`
      : mode === 'both'
      ? `🎲 ${player.name} rolled both dice${reason ? ` (${reason})` : ''}`
      : `🎲 ${player.name} rolled ${mode === 'light' ? 'Light' : 'Dark'} Die`;

    addLog(room, `${label}: ${result.summary}`, 'roll');
    broadcastRoom(roomCode);
  });

  // Play Minotaur Card: Attacker forces all OTHER players to roll both dice and lose resources
  socket.on('play_minotaur_card', ({ roomCode, attackerPlayerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.players.length === 0) return;
    const attacker = room.players.find((p) => p.id === attackerPlayerId);
    const attackerName = attacker ? attacker.name : 'A Hero';

    // Target all opponents (or if only 1 player is in the room during solo testing, target that player)
    const targets =
      room.players.length > 1
        ? room.players.filter((p) => p.id !== attackerPlayerId)
        : room.players;

    saveUndoSnapshot(room, `${attackerName} Played Minotaur`);
    const summaries = [];
    for (const target of targets) {
      const result = rollSinglePlayerDice(room, target, 'both', true);
      summaries.push(`${target.name}: ${result.summary}`);
    }

    addLog(room, `🐂 ${attackerName} played Minotaur! Opponents roll & lose: ${summaries.join(' | ')}`, 'roll');
    broadcastRoom(roomCode);
  });

  // Resolve a pending choice on a rolled die face (Choice, Mirror, Shield, Boar)
  socket.on('resolve_roll_choice', ({ roomCode, playerId, choiceId, optionIndex }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.lastRoll || !player.lastRoll.pendingChoices) return;

    const choiceIdx = player.lastRoll.pendingChoices.findIndex((c) => c.choiceId === choiceId);
    if (choiceIdx === -1) return;

    const choice = player.lastRoll.pendingChoices[choiceIdx];
    const option = choice.options[optionIndex];
    if (!option) return;

    saveUndoSnapshot(room, `${player.name} Roll Choice`);
    const res = applyRewardsToPlayer(player, option.rewards, choice.multiplier || 1, choice.isMinotaur);
    player.lastRoll.pendingChoices.splice(choiceIdx, 1);

    const noteText = option.note ? ` (${option.note})` : '';
    addLog(
      room,
      `✨ ${player.name} chose ${option.label} from ${choice.faceName} → ${res.appliedText}${noteText}`,
      'choice'
    );
    broadcastRoom(roomCode);
  });

  // Forge a new face onto a player's die
  socket.on(
    'forge_die_face',
    ({ roomCode, playerId, dieType, slotIndex, sourceType, faceId, customFace, autoPayGold = true, discountGold = 0, forceBoarOverride = false }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === playerId);
      if (!player) return;

      const targetDie = dieType === 'dark' ? player.darkDie : player.lightDie;
      const slot = Number(slotIndex);
      if (slot < 0 || slot > 5) return;

      const oldFace = targetDie[slot];
      if (oldFace.isBoar && !forceBoarOverride) {
        if (callback) {
          callback({
            ok: false,
            error: 'Tenacious Boar cannot be forged over! (Check "Override rule" if fixing a mistake.)'
          });
        }
        return;
      }

      let newFaceTemplate = null;
      let goldCost = 0;
      let sanctuaryEntry = null;

      if (sourceType === 'sanctuary') {
        sanctuaryEntry = room.sanctuary.find((s) => s.id === faceId);
        if (!sanctuaryEntry) {
          if (callback) callback({ ok: false, error: 'Sanctuary face not found.' });
          return;
        }
        if (sanctuaryEntry.remaining <= 0 && !forceBoarOverride) {
          if (callback) callback({ ok: false, error: 'None left in the Sanctuary pool! (Enable override to force.)' });
          return;
        }
        newFaceTemplate = { ...sanctuaryEntry };
        delete newFaceTemplate.remaining;
        delete newFaceTemplate.maxStock;
        goldCost = Math.max(0, (sanctuaryEntry.cost || 0) - (Number(discountGold) || 0));
      } else if (sourceType === 'garden') {
        const gardenEntry = GARDEN_FACES.find((g) => g.id === faceId);
        if (!gardenEntry) {
          if (callback) callback({ ok: false, error: 'Special face not found.' });
          return;
        }
        newFaceTemplate = { ...gardenEntry };
        goldCost = 0;
      } else if (sourceType === 'custom' && customFace) {
        newFaceTemplate = {
          id: `custom_${Date.now()}`,
          name: customFace.name || 'Custom Face',
          kind: 'fixed',
          rewards: {
            gold: Number(customFace.gold) || 0,
            sun: Number(customFace.sun) || 0,
            moon: Number(customFace.moon) || 0,
            glory: Number(customFace.glory) || 0
          },
          theme: 'combo',
          cost: 0
        };
      }

      if (!newFaceTemplate) return;

      if (autoPayGold && goldCost > 0 && player.resources.gold < goldCost) {
        if (callback) {
          callback({
            ok: false,
            error: `Not enough Gold! Needs ${goldCost} Gold, but ${player.name} has ${player.resources.gold} Gold. (Uncheck "Auto-deduct Gold" to forge for free.)`
          });
        }
        return;
      }

      saveUndoSnapshot(room, `${player.name} Forged ${newFaceTemplate.name}`);

      if (autoPayGold && goldCost > 0) {
        player.resources.gold -= goldCost;
      }
      if (sanctuaryEntry && sanctuaryEntry.remaining > 0) {
        sanctuaryEntry.remaining -= 1;
      }

      targetDie[slot] = {
        ...newFaceTemplate,
        slot
      };
      player.removedFacesCount = (player.removedFacesCount || 0) + 1;

      // Per official rules, newly forged face is placed facing up on the Hero Inventory
      if (dieType === 'dark') {
        player.lastRoll.darkSlot = slot;
      } else {
        player.lastRoll.lightSlot = slot;
      }

      const costText = autoPayGold && goldCost > 0 ? ` for ${goldCost} Gold` : ' (Free / Card)';
      addLog(
        room,
        `🔨 ${player.name} forged [${newFaceTemplate.name}] onto ${dieType === 'dark' ? 'Dark' : 'Light'} Die (replaced [${oldFace.name}])${costText}.`,
        'forge'
      );

      broadcastRoom(roomCode);
      if (callback) callback({ ok: true });
    }
  );

  // Manual resource / score / chest / hammer adjustment
  socket.on('adjust_resource', ({ roomCode, playerId, resource, delta, exactValue }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    if (!['gold', 'sun', 'moon', 'glory', 'cardGlory', 'chests', 'hammerProgress'].includes(resource)) return;

    saveUndoSnapshot(room, `${player.name} ${resource}`);
    const caps = getPlayerCaps(player);

    const oldVal = Number(player.resources[resource]) || 0;
    let newVal = typeof exactValue === 'number' ? exactValue : oldVal + Number(delta || 0);

    if (resource === 'gold') newVal = Math.max(0, Math.min(caps.gold, newVal));
    else if (resource === 'sun') newVal = Math.max(0, Math.min(caps.sun, newVal));
    else if (resource === 'moon') newVal = Math.max(0, Math.min(caps.moon, newVal));
    else if (resource === 'chests') newVal = Math.max(0, Math.min(3, newVal));
    else if (resource === 'hammerProgress') {
      newVal = Math.max(0, Math.min(30, newVal));
      // Check if Hammer crossed 15 or 30 milestone
      if (oldVal < 15 && newVal >= 15) {
        player.resources.glory += 10;
        addLog(room, `🔨 ${player.name} reached 15 on The Blacksmith's Hammer and gained +10 Glory!`, 'choice');
      }
      if (oldVal < 30 && newVal >= 30) {
        player.resources.glory += 15;
        addLog(room, `🔨 ${player.name} completed The Blacksmith's Hammer (30/30) and gained +15 Glory!`, 'choice');
      }
    } else {
      // glory or cardGlory can be any non-negative integer
      newVal = Math.max(0, newVal);
    }

    const diff = newVal - oldVal;
    if (diff === 0) {
      room.undoStack.pop();
      return;
    }

    player.resources[resource] = newVal;
    const sign = diff > 0 ? `+${diff}` : `${diff}`;
    const labelMap = {
      gold: 'Gold',
      sun: 'Sun Shards',
      moon: 'Moon Shards',
      glory: 'Glory Track',
      cardGlory: 'Card Glory (Feats)',
      chests: "Blacksmith's Chests",
      hammerProgress: 'Hammer Track'
    };
    addLog(room, `${player.name}: ${sign} ${labelMap[resource]} (now ${newVal}).`, 'resource');
    broadcastRoom(roomCode);
  });

  socket.on('toggle_hammer', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.resources.hasHammer = !player.resources.hasHammer;
    broadcastRoom(roomCode);
  });

  socket.on('rename_player', ({ roomCode, playerId, newName }) => {
    const room = rooms.get(roomCode);
    if (!room || !newName || !newName.trim()) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    const oldName = player.name;
    player.name = newName.trim().slice(0, 24);
    addLog(room, `${oldName} renamed to ${player.name}.`, 'system');
    broadcastRoom(roomCode);
  });

  // Advance turn / round tracker
  socket.on('next_turn', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.players.length === 0) return;
    saveUndoSnapshot(room, 'Next Turn');

    room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
    if (room.activePlayerIndex === 0) {
      room.round = Math.min(room.maxRounds + 1, room.round + 1);
    }
    room.divineBlessingsRemainingInTurn = room.setupPlayerCount === 2 ? 2 : 1;

    const activePlayer = room.players[room.activePlayerIndex];
    if (room.round > room.maxRounds) {
      addLog(room, `🏆 Final Round (${room.maxRounds}) complete! Tally your Heroic Feat card Glory points!`, 'system');
    } else {
      addLog(
        room,
        `➡️ Round ${room.round}/${room.maxRounds} — Active Hero: ${activePlayer ? activePlayer.name : 'Player 1'}.`,
        'system'
      );
    }
    broadcastRoom(roomCode);
  });

  // Undo last action
  socket.on('undo_last', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.undoStack.length === 0) return;

    const { snapshot, actionLabel } = room.undoStack.pop();
    const restored = JSON.parse(snapshot);
    room.players = restored.players;
    room.sanctuary = restored.sanctuary;
    room.round = restored.round;
    room.maxRounds = restored.maxRounds;
    room.activePlayerIndex = restored.activePlayerIndex;
    room.divineBlessingsRemainingInTurn = restored.divineBlessingsRemainingInTurn;

    addLog(room, `↩️ Undid action: ${actionLabel}`, 'system');
    broadcastRoom(roomCode);
  });

  // Reset game to fresh state (keeping players in the room!)
  socket.on('reset_game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    saveUndoSnapshot(room, 'Reset Game');

    room.round = 1;
    room.activePlayerIndex = 0;
    room.divineBlessingsRemainingInTurn = room.setupPlayerCount === 2 ? 2 : 1;
    room.sanctuary = buildSanctuarySupply(room.setupPlayerCount);
    room.players = room.players.map((p, idx) =>
      createStartingPlayer(idx, p.name, p.color, p.id)
    );
    addLog(room, `🔄 Game reset! All dice restored to starting faces and resources reset.`, 'system');
    broadcastRoom(roomCode);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dice Forge Helper server listening on http://localhost:${PORT}`);
});
